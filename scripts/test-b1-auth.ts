import dotenv from "dotenv";
dotenv.config();

// Ensure test environment variables
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/reviewlock";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "12345678901234567890123456789012";
process.env.STREAM_TOKEN_SECRET = process.env.STREAM_TOKEN_SECRET || "12345678901234567890123456789012";
process.env.DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || "12345678901234567890123456789012";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-client-secret";
process.env.GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "test-refresh-token";
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "test-root-folder";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/db/schema";
import { setTestDb } from "../lib/db";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import {
  createSession,
  validateSessionToken,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from "../lib/auth/session";
import { checkRateLimit, resetRateLimit } from "../lib/auth/rate-limit";

async function setupInMemoryDatabase() {
  const mem = newDb();

  // Register PostgreSQL gen_random_uuid() function in pg-mem
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: mem.public.getType("uuid" as any),
    implementation: () => crypto.randomUUID(),
  });

  // Read generated migration SQL
  const migrationPath = path.join(process.cwd(), "drizzle", "0000_clean_miss_america.sql");
  const sqlContent = fs.readFileSync(migrationPath, "utf-8");

  // Execute statements
  const statements = sqlContent
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      mem.public.none(statement);
    } catch (err: any) {
      if (!err.message?.includes("already exists")) {
        console.warn("[pg-mem statement notice]:", err.message);
      }
    }
  }

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  const origQuery = pool.query.bind(pool);
  pool.query = function (c: any, v: any, cb: any) {
    let isArr = false;
    if (typeof c === "object" && c) {
      if (c.rowMode === "array") isArr = true;
      delete c.rowMode;
      delete c.types;
    }
    const promise = origQuery(c, v)
      .then((res: any) => {
        if (isArr && res && res.rows) {
          res.rows = res.rows.map((r: any) =>
            Array.isArray(r) ? r : Object.values(r)
          );
        }
        if (cb) cb(null, res);
        return res;
      })
      .catch((err: any) => {
        if (cb) cb(err);
        throw err;
      });
    return typeof cb === "function" ? undefined : promise;
  };
  const memDrizzle = drizzle(pool, { schema });
  setTestDb(memDrizzle);
  return memDrizzle;
}

async function runAuthTests() {
  console.log("================================================================================");
  console.log("ReviewLock Auth & Session Verification Test Suite (CHUNK B1)");
  console.log("================================================================================\n");

  console.log("--> Setting up in-memory PostgreSQL database with Drizzle schema...");
  await setupInMemoryDatabase();
  console.log("✓ In-memory database initialized with all CONTRACT §7 tables & indexes.\n");

  // ---------------------------------------------------------------------------
  // 1. Password Hashing (Argon2id)
  // ---------------------------------------------------------------------------
  console.log("--> 1. Testing Argon2id password hashing and verification...");
  const rawPassword = "CorrectHorseBatteryStaple123!";
  const hash = await hashPassword(rawPassword);
  assert(hash.startsWith("$argon2id$"), "Hash must be an Argon2id format string");
  assert(await verifyPassword(hash, rawPassword), "Valid password must verify successfully");
  assert(!(await verifyPassword(hash, "wrong-password")), "Invalid password must fail verification");
  console.log("✓ Argon2id hash & verify working as expected.\n");

  // ---------------------------------------------------------------------------
  // 2. Rate Limiting (CONTRACT §6)
  // ---------------------------------------------------------------------------
  console.log("--> 2. Testing rate limiter (5 attempts per 15 min)...");
  const testIp = "192.168.1.100";
  const rateLimitKey = `test-login:${testIp}`;
  resetRateLimit(rateLimitKey);

  for (let i = 1; i <= 5; i++) {
    const res = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
    assert(res.allowed, `Attempt ${i} should be allowed`);
    assert.strictEqual(res.remaining, 5 - i, `Remaining attempts should be ${5 - i}`);
  }

  // 6th attempt should be blocked
  const blockedRes = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  assert(!blockedRes.allowed, "6th attempt must be rejected");
  assert.strictEqual(blockedRes.remaining, 0, "Remaining attempts must be 0");
  assert(blockedRes.resetInSeconds > 0, "Reset seconds must be positive");

  resetRateLimit(rateLimitKey);
  const unblockedRes = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  assert(unblockedRes.allowed, "Resetting key must restore access");
  console.log("✓ Rate limiting correctly blocks on 6th attempt and supports reset.\n");

  // ---------------------------------------------------------------------------
  // 3. Database Sessions Lifecycle
  // ---------------------------------------------------------------------------
  console.log("--> 3. Testing database sessions lifecycle (CONTRACT §7)...");
  const testUserId = crypto.randomUUID();

  // Insert user for session foreign key
  const { users } = schema;
  const { db } = await import("../lib/db");
  await db.insert(users).values({
    id: testUserId,
    email: "editor-session-test@example.com",
    passwordHash: hash,
    displayName: "Session Test Editor",
    storageUsedBytes: 0,
  });

  const { token, expiresAt } = await createSession(testUserId);
  assert(token.length >= 32, "Session token must be secure random length");
  assert(expiresAt > new Date(), "Session expiration must be in future");

  const validated = await validateSessionToken(token);
  assert(validated !== null, "Valid session token must return session user");
  assert.strictEqual(validated?.user.id, testUserId);
  assert.strictEqual(validated?.user.email, "editor-session-test@example.com");

  // Invalidation
  await invalidateSession(token);
  const revalidated = await validateSessionToken(token);
  assert(revalidated === null, "Invalidated session must return null");
  console.log("✓ Session creation, lookup, and revocation working correctly.\n");

  // ---------------------------------------------------------------------------
  // 4. API Endpoints: Signup, Login, Logout, Me
  // ---------------------------------------------------------------------------
  console.log("--> 4. Testing API Route Handlers (/api/auth/*)...");
  const { POST: signupHandler } = await import("../app/api/auth/signup/route");
  const { POST: loginHandler } = await import("../app/api/auth/login/route");
  const { GET: meHandler } = await import("../app/api/auth/me/route");
  const { POST: logoutHandler } = await import("../app/api/auth/logout/route");

  // 4A: Signup
  console.log("    --> Testing POST /api/auth/signup (Valid registration)...");
  const signupReq = new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "neweditor@example.com",
      password: "SuperSecretPassword123!",
      displayName: "New Editor",
    }),
  });

  const signupRes = await signupHandler(signupReq);
  const signupJson = await signupRes.json();
  assert.strictEqual(signupRes.status, 200);
  assert(signupJson.ok, "Signup must return ok: true");
  assert.strictEqual(signupJson.data.user.email, "neweditor@example.com");
  assert.strictEqual(signupJson.data.user.displayName, "New Editor");

  const setCookieHeader = signupRes.headers.get("set-cookie") || "";
  assert(setCookieHeader.includes(SESSION_COOKIE_NAME), "Signup must return session cookie");
  assert(setCookieHeader.includes("HttpOnly"), "Session cookie must be HttpOnly");

  // Extract session token from cookie
  const cookieMatch = setCookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const sessionToken = cookieMatch ? cookieMatch[1] : "";
  assert(sessionToken.length > 0, "Cookie must have non-empty session token");

  // 4B: Duplicate Signup
  console.log("    --> Testing POST /api/auth/signup (Duplicate email rejection)...");
  const dupSignupReq = new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "neweditor@example.com",
      password: "AnotherPassword123!",
      displayName: "Duplicate",
    }),
  });
  const dupRes = await signupHandler(dupSignupReq);
  const dupJson = await dupRes.json();
  assert.strictEqual(dupRes.status, 409);
  assert(!dupJson.ok);
  assert.strictEqual(dupJson.error.code, "EMAIL_EXISTS");

  // 4C: Validation Error on Signup
  console.log("    --> Testing POST /api/auth/signup (Short password rejection)...");
  const shortPassReq = new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "short@example.com",
      password: "123", // Too short
      displayName: "Short",
    }),
  });
  const shortPassRes = await signupHandler(shortPassReq);
  assert.strictEqual(shortPassRes.status, 400);

  // 4D: GET /api/auth/me (Authenticated)
  console.log("    --> Testing GET /api/auth/me (With valid session cookie)...");
  const meReq = new Request("http://localhost:3000/api/auth/me", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
  });
  const meRes = await meHandler(meReq);
  const meJson = await meRes.json();
  assert.strictEqual(meRes.status, 200);
  assert(meJson.ok);
  assert.strictEqual(meJson.data.user.email, "neweditor@example.com");

  // 4E: GET /api/auth/me (Unauthenticated)
  console.log("    --> Testing GET /api/auth/me (Unauthenticated -> 401)...");
  const unauthMeReq = new Request("http://localhost:3000/api/auth/me");
  const unauthMeRes = await meHandler(unauthMeReq);
  const unauthMeJson = await unauthMeRes.json();
  assert.strictEqual(unauthMeRes.status, 401);
  assert(!unauthMeJson.ok);
  assert.strictEqual(unauthMeJson.error.code, "UNAUTHORIZED");

  // 4F: POST /api/auth/login (Valid credentials)
  console.log("    --> Testing POST /api/auth/login (Valid credentials)...");
  const loginReq = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "neweditor@example.com",
      password: "SuperSecretPassword123!",
    }),
  });
  const loginRes = await loginHandler(loginReq);
  const loginJson = await loginRes.json();
  assert.strictEqual(loginRes.status, 200);
  assert(loginJson.ok);
  assert.strictEqual(loginJson.data.user.email, "neweditor@example.com");

  // 4G: POST /api/auth/login (Invalid password)
  console.log("    --> Testing POST /api/auth/login (Invalid password rejection)...");
  const badLoginReq = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "neweditor@example.com",
      password: "WrongPassword999!",
    }),
  });
  const badLoginRes = await loginHandler(badLoginReq);
  const badLoginJson = await badLoginRes.json();
  assert.strictEqual(badLoginRes.status, 401);
  assert(!badLoginJson.ok);
  assert.strictEqual(badLoginJson.error.code, "INVALID_CREDENTIALS");

  // 4H: POST /api/auth/logout
  console.log("    --> Testing POST /api/auth/logout (Session revocation & cookie clearing)...");
  const logoutReq = new Request("http://localhost:3000/api/auth/logout", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
  });
  const logoutRes = await logoutHandler(logoutReq);
  const logoutJson = await logoutRes.json();
  assert.strictEqual(logoutRes.status, 200);
  assert(logoutJson.ok);

  const logoutCookieHeader = logoutRes.headers.get("set-cookie") || "";
  assert(logoutCookieHeader.includes("Max-Age=0"), "Logout must clear cookie with Max-Age=0");

  // Verifying that revoked session token can no longer authenticate
  const afterLogoutMeReq = new Request("http://localhost:3000/api/auth/me", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
  });
  const afterLogoutRes = await meHandler(afterLogoutMeReq);
  assert.strictEqual(afterLogoutRes.status, 401);

  console.log("\n================================================================================");
  console.log("ALL B1 AUTH, SESSION, AND RATE-LIMIT TESTS PASSED!");
  console.log("================================================================================\n");
}

runAuthTests().catch((err) => {
  console.error("\n❌ Auth test suite failed:", err);
  process.exit(1);
});
