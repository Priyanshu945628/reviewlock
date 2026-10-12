// scripts/test-b7-security.ts
// Automated security and hardening test suite for CHUNK B7 conforming to CONTRACT §2, §6 & CHUNKS B7

import dotenv from "dotenv";
dotenv.config();

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/reviewlock";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "12345678901234567890123456789012";
process.env.STREAM_TOKEN_SECRET =
  process.env.STREAM_TOKEN_SECRET || "stream-token-secret-32-chars-test!";
process.env.DOWNLOAD_TOKEN_SECRET =
  process.env.DOWNLOAD_TOKEN_SECRET || "download-token-secret-32-chars-test!";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client-id";
process.env.GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "test-client-secret";
process.env.GOOGLE_REFRESH_TOKEN =
  process.env.GOOGLE_REFRESH_TOKEN || "test-refresh-token";
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID =
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "test-root-folder";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { setTestDb, db as defaultDb } from "../lib/db";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import {
  generateStreamToken,
  verifyStreamToken,
  verifyLinkPasscode,
  claimViewerSlot,
} from "../lib/viewer/service";
import {
  createDownloadToken,
  validateAndConsumeDownloadToken,
} from "../lib/download/service";
import { redact } from "../lib/logger";
import { getStorageProvider } from "../lib/storage";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ ${message}`);
}

async function setupInMemoryDatabase() {
  const mem = newDb();

  mem.public.registerFunction({
    name: "gen_random_uuid",
    impure: true,
    returns: mem.public.getType("uuid" as any),
    implementation: () => crypto.randomUUID(),
  });

  const migrationPath = path.join(
    process.cwd(),
    "drizzle",
    "0000_clean_miss_america.sql"
  );
  const sqlContent = fs.readFileSync(migrationPath, "utf-8");

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

async function runB7SecurityTests() {
  console.log("\n================================================================================");
  console.log("CHUNKS B7: Hardening & Security Audit Test Suite");
  console.log("================================================================================\n");

  let db = defaultDb;
  try {
    await db.select().from(schema.users).limit(1);
  } catch {
    console.log("--> Setting up self-contained in-memory database...");
    db = await setupInMemoryDatabase();
  }

  // Create test user and project to satisfy foreign key constraints across tests
  const [secUser] = await db
    .insert(schema.users)
    .values({
      email: `sec-user-${Date.now()}@reviewlock.internal`,
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$fakehash$fakehash",
      displayName: "Security User",
    })
    .returning();

  const [secProject] = await db
    .insert(schema.projects)
    .values({
      userId: secUser.id,
      title: "Security Master Video",
      originalFilename: "sec_video.mp4",
      originalSize: 1048576,
      status: "ready",
    })
    .returning();

  console.log("--> Testing 1: Stream Token HMAC Cryptography & Tamper Resistance");
  {
    const linkId = "link-sec-001";
    const sessionId = "sess-sec-001";
    const token = generateStreamToken(linkId, sessionId, 60);

    // 1.1 Valid verification
    const validRes = verifyStreamToken(token, linkId);
    assert(validRes.valid === true, "Valid stream token verifies cleanly");
    assert(validRes.sessionId === sessionId, "Extracted sessionId matches original session");

    // 1.2 Tampered signature
    const parts = token.split(".");
    const tamperedSig = `${parts[0]}.${parts[1]}.badSignature`;
    const tamperedRes = verifyStreamToken(tamperedSig, linkId);
    assert(tamperedRes.valid === false, "Tampered signature fails verification");
    assert(tamperedRes.error === "INVALID", "Error returned is INVALID");

    // 1.3 Tampered linkId binding
    const crossLinkRes = verifyStreamToken(token, "link-different-999");
    assert(crossLinkRes.valid === false, "Stream token issued for link A rejected on link B");
    assert(crossLinkRes.error === "MISMATCH", "Error returned is MISMATCH");

    // 1.4 Expired token
    const expiredToken = generateStreamToken(linkId, sessionId, -10); // expired 10s ago
    const expiredRes = verifyStreamToken(expiredToken, linkId);
    assert(expiredRes.valid === false, "Expired stream token fails verification");
    assert(expiredRes.error === "EXPIRED", "Error returned is EXPIRED");
  }

  console.log("\n--> Testing 2: Download Token Atomic Single-Use & Expiration");
  {
    // Insert test link
    const [testLink] = await db
      .insert(schema.shareLinks)
      .values({
        projectId: secProject.id,
        slug: crypto.randomBytes(16).toString("base64url"),
        clientLabel: "Security Test Client",
        visibility: "public",
        status: "unlocked",
        maxViewers: 10,
      })
      .returning();

    const grant = await createDownloadToken(testLink.id, "original", 5);
    assert(Boolean(grant.token), "createDownloadToken generates token");

    // First use: must succeed
    const firstUse = await validateAndConsumeDownloadToken(grant.token, testLink.id);
    assert(firstUse.valid === true, "First consumption of download token succeeds");

    // Second use: must be blocked (single-use enforcement)
    const secondUse = await validateAndConsumeDownloadToken(grant.token, testLink.id);
    assert(secondUse.valid === false, "Second consumption of download token rejected");
    assert(secondUse.error === "TOKEN_ALREADY_USED", "Error is TOKEN_ALREADY_USED");
  }

  console.log("\n--> Testing 3: Passcode Lockout & Brute-Force Rate Limiting");
  {
    const passcodePlain = "SEC999";
    const passcodeHash = await hashPassword(passcodePlain);
    const clientIp = `192.168.100.${Math.floor(Math.random() * 200 + 1)}`;

    // Create a link with passcode
    const [passcodeLink] = await db
      .insert(schema.shareLinks)
      .values({
        projectId: secProject.id,
        slug: crypto.randomBytes(16).toString("base64url"),
        clientLabel: "Passcode Client",
        visibility: "private",
        passcodeHash,
        status: "active",
        maxViewers: 5,
      })
      .returning();

    // 5 failed attempts
    for (let i = 1; i <= 5; i++) {
      const res = await verifyLinkPasscode(passcodeLink.id, "WRONGCODE", clientIp);
      assert(res.ok === false, `Failed attempt ${i} returns ok: false`);
      assert(res.error === "PASSCODE_WRONG", "Error returned is PASSCODE_WRONG");
    }

    // 6th attempt must be locked out immediately
    const lockoutRes = await verifyLinkPasscode(passcodeLink.id, "WRONGCODE", clientIp);
    assert(lockoutRes.ok === false, "6th attempt is blocked");
    assert(lockoutRes.error === "RATE_LIMITED", "Client IP is locked out after 5 failures (RATE_LIMITED)");

    // Even if the attacker now submits the correct passcode, they remain locked out
    const lockedValidAttempt = await verifyLinkPasscode(passcodeLink.id, passcodePlain, clientIp);
    assert(lockedValidAttempt.ok === false && lockedValidAttempt.error === "RATE_LIMITED", "Locked client cannot succeed even with correct passcode");
  }

  console.log("\n--> Testing 4: Log Redaction & Secret Sanitization");
  {
    // 4.1 Google Refresh Token redaction
    const rawRefreshToken = "1//0gLdmWf6OdXaBCgYIARAAGBASNwF-L9IrxQVK9nf_my1IePHaofxC2l9LDbVf67";
    const redactedToken = redact(`Connected with token: ${rawRefreshToken}`);
    assert(!redactedToken.includes(rawRefreshToken), "Google Refresh Token is redacted from string");
    assert(redactedToken.includes("[REDACTED_GOOGLE_REFRESH_TOKEN]"), "Replacement marker is present");

    // 4.2 Stream Token redaction
    const testStreamToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.1728739200.abcdefghijklmnopqrstuvwxyz123456";
    const redactedStream = redact(`Serving playlist with t=${testStreamToken}`);
    assert(!redactedStream.includes(testStreamToken), "Stream token is redacted from string");
    assert(redactedStream.includes("[REDACTED_SIGNED_TOKEN]"), "Stream token replacement marker is present");

    // 4.3 Argon2id Hash redaction
    const argonHash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$abcdefghijklmnopqrstuvwxyz";
    const redactedArgon = redact(`User hash: ${argonHash}`);
    assert(!redactedArgon.includes(argonHash), "Argon2id hash is redacted from string");
    assert(redactedArgon.includes("[REDACTED_ARGON2_HASH]"), "Argon hash replacement marker is present");

    // 4.4 Session cookie redaction
    const cookieString = "rl_sess=session_abc123xyz_token";
    const redactedCookie = redact(`Cookie header: ${cookieString}`);
    assert(!redactedCookie.includes("session_abc123xyz_token"), "Session cookie value is redacted");

    // 4.5 Object redaction of sensitive keys
    const sensitiveObj = {
      user: "editor@test.com",
      password: "SuperSecretPassword123!",
      sessionSecret: "32charsSecretHere!",
      passcode: "123456",
    };
    const redactedObj = redact(sensitiveObj);
    assert(redactedObj.user === "editor@test.com", "Non-sensitive key preserved");
    assert(redactedObj.password === "[REDACTED_SENSITIVE_KEY]", "Password key redacted");
    assert(redactedObj.sessionSecret === "[REDACTED_SENSITIVE_KEY]", "Secret key redacted");
    assert(redactedObj.passcode === "[REDACTED_SENSITIVE_KEY]", "Passcode key redacted");
  }

  console.log("\n--> Testing 5: Drive Root Folder Permissions Audit");
  {
    const storage = getStorageProvider();
    if (typeof storage.auditFolderPermissions === "function") {
      const audit = await storage.auditFolderPermissions();
      assert(audit.secure === true, "Root storage container confirmed secure (no public sharing)");
      assert(audit.warnings.length === 0, "No permission warnings found");
    } else {
      console.log("  (Provider does not implement auditFolderPermissions; skipped)");
    }
  }

  console.log("\n================================================================================");
  console.log(`✅ CHUNK B7 ALL SECURITY TESTS PASSED (${passedTests}/${totalTests})`);
  console.log("================================================================================\n");
}

runB7SecurityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
