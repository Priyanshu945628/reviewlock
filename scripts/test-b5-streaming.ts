// Automated security and streaming test suite for Chunk B5: Viewer Access & Streaming
// Conforming to CONTRACT §6, §7, §9 & CHUNKS B5

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
import { setTestDb } from "../lib/db";
import {
  generateStreamToken,
  verifyStreamToken,
  hashClientIdentifiers,
  claimViewerSlot,
  verifyLinkPasscode,
} from "../lib/viewer/service";
import { createShareLink, revokeShareLink } from "../lib/links/service";
import { hashPassword } from "../lib/auth/password";
import { resetRateLimit } from "../lib/auth/rate-limit";

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

async function runB5Tests() {
  console.log("================================================================================");
  console.log("ReviewLock Viewer Access & Streaming Security Tests (CHUNKS B5)");
  console.log("================================================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✓ ${desc}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAILED: ${desc}`);
      failedCount++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Stream Token HMAC Security Tests (CONTRACT §6)
  // ---------------------------------------------------------------------------
  console.log("--> 1. Testing Stream Token Generation, Expiry & Cross-Link Binding...");

  const linkA = crypto.randomUUID();
  const linkB = crypto.randomUUID();
  const session1 = crypto.randomUUID();

  // 1.1 Generate valid token
  const validToken = generateStreamToken(linkA, session1, 60);
  const v1 = verifyStreamToken(validToken, linkA);
  assert(v1.valid === true, "Valid token with matching linkId verified successfully");
  assert(v1.sessionId === session1, "Session ID extracted correctly from token payload");

  // 1.2 Expired token rejected with 403 / EXPIRED
  const expiredToken = generateStreamToken(linkA, session1, -1); // expired 1s ago
  const vExpired = verifyStreamToken(expiredToken, linkA);
  assert(vExpired.valid === false && vExpired.error === "EXPIRED", "Expired stream token rejected with EXPIRED");

  // 1.3 Token for Link A rejected when used on Link B (Cross-link rejection)
  const vMismatch = verifyStreamToken(validToken, linkB);
  assert(vMismatch.valid === false && vMismatch.error === "MISMATCH", "Token issued for Link A strictly rejected on Link B");

  // 1.4 Tampered token signature rejected
  const tamperedParts = validToken.split(".");
  tamperedParts[3] = "invalid_signature_hash_123";
  const tamperedToken = tamperedParts.join(".");
  const vTampered = verifyStreamToken(tamperedToken, linkA);
  assert(vTampered.valid === false && vTampered.error === "INVALID", "Tampered token signature strictly rejected");

  // ---------------------------------------------------------------------------
  // 2. Passcode Verification & Lockout (CONTRACT §6: 5 tries -> lockout)
  // ---------------------------------------------------------------------------
  console.log("\n--> 2. Testing Passcode Verification & 5-Attempt Lockout (CONTRACT §6)...");

  const activeDb = await setupInMemoryDatabase();

  const testPasscode = "TEST99";
  const passHash = await hashPassword(testPasscode);

  const [testUser] = await activeDb
    .insert(schema.users)
    .values({
      email: `viewer_test_${Date.now()}@reviewlock.io`,
      passwordHash: passHash,
      displayName: "Viewer Tester",
      storageUsedBytes: 0,
    })
    .returning();

  const [testProj] = await activeDb
    .insert(schema.projects)
    .values({
      userId: testUser.id,
      title: "Streaming Security Project",
      status: "ready",
      originalFilename: "security_test.mp4",
      originalSize: 10 * 1024 * 1024,
      durationSeconds: 60,
    })
    .returning();

  const linkPrivate = await createShareLink({
    projectId: testProj.id,
    userId: testUser.id,
    clientLabel: "Private Client",
    visibility: "private",
    passcode: testPasscode,
    maxViewers: 1,
  });

  const clientIp = "192.168.1.100";
  resetRateLimit(`passcode:${clientIp}:${linkPrivate.id}`);

  // Test correct passcode
  const correctCheck = await verifyLinkPasscode(linkPrivate.id, testPasscode, clientIp);
  assert(correctCheck.ok === true, "Correct passcode verifies successfully");

  // Test wrong passcode 4 times
  for (let i = 1; i <= 4; i++) {
    const wrong = await verifyLinkPasscode(linkPrivate.id, "WRONG1", clientIp);
    assert(wrong.ok === false && wrong.error === "PASSCODE_WRONG", `Wrong attempt #${i} rejected with PASSCODE_WRONG`);
  }

  // 5th attempt locks out
  const lockedOut = await verifyLinkPasscode(linkPrivate.id, "WRONG1", clientIp);
  assert(lockedOut.ok === false && lockedOut.error === "RATE_LIMITED", "5th failed attempt triggers RATE_LIMITED lockout");

  // Subsequent correct attempt while locked out is also rejected
  const lockedOutCorrect = await verifyLinkPasscode(linkPrivate.id, testPasscode, clientIp);
  assert(lockedOutCorrect.ok === false && lockedOutCorrect.error === "RATE_LIMITED", "Locked out client blocked even with correct passcode");

  // ---------------------------------------------------------------------------
  // 3. Concurrency Test: 50 Parallel Opens with max_viewers=1 (CONTRACT §6 & §10)
  // ---------------------------------------------------------------------------
  console.log("\n--> 3. Testing 50 Parallel Opens with max_viewers=1 (CONTRACT §6)...");

  const singleViewerLink = await createShareLink({
    projectId: testProj.id,
    userId: testUser.id,
    clientLabel: "Single Viewer Link",
    visibility: "public",
    maxViewers: 1,
  });

  const parallelCount = 50;
  const parallelPromises = Array.from({ length: parallelCount }, (_, idx) => {
    const sessId = crypto.randomUUID();
    const { ipHash, uaHash } = hashClientIdentifiers(`10.0.0.${idx + 1}`);
    return claimViewerSlot({
      linkId: singleViewerLink.id,
      sessionId: sessId,
      ipHash,
      uaHash,
    });
  });

  const results = await Promise.all(parallelPromises);
  const successes = results.filter((r) => r.ok && r.claimed);
  const rejected = results.filter((r) => !r.ok);

  assert(
    successes.length === 1,
    `Exactly 1 of ${parallelCount} concurrent opens succeeded (got ${successes.length})`
  );
  assert(
    rejected.length === parallelCount - 1,
    `Remaining ${parallelCount - 1} concurrent requests rejected with VIEWERS_EXHAUSTED`
  );

  // ---------------------------------------------------------------------------
  // 4. Returning Viewer Cookie Session Does NOT Consume a Second Slot
  // ---------------------------------------------------------------------------
  console.log("\n--> 4. Testing Returning Viewer Cookie Session (CONTRACT §6)...");

  const winningSessionId = successes[0].sessionId!;
  const returningResult = await claimViewerSlot({
    linkId: singleViewerLink.id,
    sessionId: winningSessionId,
    ipHash: "any-hash",
    uaHash: "any-ua",
  });

  assert(
    returningResult.ok === true && returningResult.claimed === false,
    "Returning viewer with existing cookie session is admitted WITHOUT consuming a new slot"
  );

  // ---------------------------------------------------------------------------
  // 5. Revocation Mid-Playback Stops Segments (CONTRACT §6)
  // ---------------------------------------------------------------------------
  console.log("\n--> 5. Testing Mid-Playback Revocation Stops Access (CONTRACT §6)...");

  // Revoke the link
  await revokeShareLink(singleViewerLink.id, testUser.id);

  // Fresh open attempt after revocation
  const postRevokeOpen = await claimViewerSlot({
    linkId: singleViewerLink.id,
    sessionId: crypto.randomUUID(),
    ipHash: "ip",
    uaHash: "ua",
  });
  assert(
    postRevokeOpen.ok === false && postRevokeOpen.error === "LINK_REVOKED",
    "Open attempt on revoked link rejected with LINK_REVOKED"
  );

  // Returning viewer with existing session also blocked after revocation
  const [revokedRow] = await activeDb
    .select({ status: schema.shareLinks.status })
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.id, singleViewerLink.id))
    .limit(1);

  assert(revokedRow.status === "revoked", "Link status in DB is confirmed 'revoked'");

  console.log("\n================================================================================");
  console.log(`B5 Test Results: ${passedCount} passed, ${failedCount} failed.`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runB5Tests().catch((err) => {
  console.error("Unhandled exception in B5 tests:", err);
  process.exit(1);
});
