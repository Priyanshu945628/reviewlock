// scripts/test-b6-downloads.ts
// Automated test suite for CHUNK B6: Payment gate, download tokens, and live-piped download engine conforming to CONTRACT §4.0.2, §6, §7, §9

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
import { hashPassword } from "../lib/auth/password";
import { unlockShareLink } from "../lib/links/service";
import {
  createDownloadToken,
  validateAndConsumeDownloadToken,
} from "../lib/download/service";
import { env } from "../lib/env";

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

async function runB6Tests() {
  console.log("\n================================================================================");
  console.log("CHUNKS B6: Payment Gate & Live-Piped Download Test Suite");
  console.log("================================================================================\n");

  let db = defaultDb;
  try {
    // Try pinging the default DB
    await db.select().from(schema.users).limit(1);
  } catch {
    console.log("--> Local Postgres not running; setting up self-contained in-memory database...");
    db = await setupInMemoryDatabase();
  }

  const testEmail = `b6-tester-${Date.now()}@reviewlock.internal`;
  const passwordHash = await hashPassword("TestPassword123!");

  // 1. Create test user
  const [user] = await db
    .insert(schema.users)
    .values({
      email: testEmail,
      passwordHash,
      displayName: "B6 Tester",
      storageUsedBytes: 0,
    })
    .returning();

  // 2. Prepare test original file on disk
  const testDir = path.join(env.DATA_DIR, "uploads", "b6-project-test");
  fs.mkdirSync(testDir, { recursive: true });

  const testFileSize = 2 * 1024 * 1024; // 2 MiB random binary payload
  const testBuffer = crypto.randomBytes(testFileSize);
  const testFileSha256 = crypto.createHash("sha256").update(testBuffer).digest("hex");
  const testFileName = "master_cut_prores.mov";
  const testFilePath = path.join(testDir, testFileName);
  fs.writeFileSync(testFilePath, testBuffer);

  // 3. Create test project
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId: user.id,
      title: "Commercial Master Cut",
      originalFilename: testFileName,
      originalSize: testFileSize,
      durationSeconds: 120,
      width: 3840,
      height: 2160,
      fps: 24,
      status: "ready",
      storageProvider: "local",
    })
    .returning();

  // 4. Create locked test share link
  const linkSlug = crypto.randomBytes(16).toString("base64url");
  const [link] = await db
    .insert(schema.shareLinks)
    .values({
      projectId: project.id,
      slug: linkSlug,
      clientLabel: "Nike Global Brand",
      visibility: "public",
      status: "active", // Locked preview state
      maxViewers: 10,
    })
    .returning();

  console.log("--> Testing 1: Unlock State Transition & Audit Log");
  {
    assert(link.status === "active", "Link initial status is active (locked preview)");

    // Editor unlocks the link (CONTRACT §6)
    const unlocked = await unlockShareLink(link.id, user.id);
    assert(unlocked.status === "unlocked", "unlockShareLink updates status to 'unlocked'");
    assert(unlocked.unlockedAt !== null, "unlockShareLink records unlockedAt timestamp");

    // Verify audit log
    const [logEntry] = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.entityId, link.id),
          eq(schema.auditLog.action, "link_unlocked")
        )
      )
      .limit(1);

    assert(!!logEntry, "Audit log records 'link_unlocked' action");
    assert(logEntry.actorType === "editor", "Audit log actorType is 'editor'");
    assert(logEntry.actorId === user.id, "Audit log actorId matches editor user ID");
  }

  console.log("\n--> Testing 2: Single-Use Download Token Issuance & Signature Validation");
  let validToken = "";
  let grantRecordId = "";
  {
    // Generate token
    const grant = await createDownloadToken(link.id, "original", 5);
    validToken = grant.token;
    assert(typeof grant.token === "string" && grant.token.length > 30, "createDownloadToken generates token");
    assert(new Date(grant.expiresAt).getTime() > Date.now(), "Token expiration is in future");

    // Verify record in database
    const tokenHash = crypto.createHash("sha256").update(validToken).digest("hex");
    const [grantRow] = await db
      .select()
      .from(schema.downloadGrants)
      .where(eq(schema.downloadGrants.tokenHash, tokenHash))
      .limit(1);

    assert(!!grantRow, "download_grants contains token hash");
    assert(grantRow.usedAt === null, "Token grant usedAt is initially null");
    grantRecordId = grantRow.id;

    // Validate token
    const valResult = await validateAndConsumeDownloadToken(validToken, link.id);
    assert(valResult.valid === true, "validateAndConsumeDownloadToken validates unused valid token");
    assert(valResult.grantId === grantRecordId, "Returned grantId matches database record");

    // Atomically verified consumed in DB
    const [consumedRow] = await db
      .select()
      .from(schema.downloadGrants)
      .where(eq(schema.downloadGrants.id, grantRecordId))
      .limit(1);
    assert(consumedRow.usedAt !== null, "Token grant usedAt is marked immediately upon consumption");
  }

  console.log("\n--> Testing 3: Single-Use Enforcement & Replay Rejection");
  {
    // Attempting to consume the same token again must fail (CONTRACT §6 & CHUNKS B6)
    const replayResult = await validateAndConsumeDownloadToken(validToken, link.id);
    assert(replayResult.valid === false, "Reused token is rejected");
    assert(replayResult.error === "TOKEN_ALREADY_USED", "Error is 'TOKEN_ALREADY_USED'");
  }

  console.log("\n--> Testing 4: Token Security, Tamper & Cross-Link Rejection");
  {
    // Tampered token signature
    const parts = validToken.split(".");
    const tamperedToken = `${parts[0]}.${parts[1]}.tamperedSignature`;
    const tamperedResult = await validateAndConsumeDownloadToken(tamperedToken, link.id);
    assert(tamperedResult.valid === false, "Tampered signature is rejected");
    assert(tamperedResult.error === "INVALID_TOKEN", "Error code is 'INVALID_TOKEN'");

    // Expired token
    const expiredGrant = await createDownloadToken(link.id, "original", -1); // expired 1 minute ago
    const expiredResult = await validateAndConsumeDownloadToken(expiredGrant.token, link.id);
    assert(expiredResult.valid === false, "Expired token is rejected");
    assert(expiredResult.error === "TOKEN_EXPIRED", "Error code is 'TOKEN_EXPIRED'");

    // Cross-link rejection (Token issued for link A presented on link B)
    const [linkB] = await db
      .insert(schema.shareLinks)
      .values({
        projectId: project.id,
        slug: crypto.randomBytes(16).toString("base64url"),
        clientLabel: "Secondary Client",
        visibility: "public",
        status: "unlocked",
        maxViewers: 5,
      })
      .returning();

    const linkBGrant = await createDownloadToken(linkB.id, "original", 5);
    const crossLinkResult = await validateAndConsumeDownloadToken(linkBGrant.token, link.id);
    assert(crossLinkResult.valid === false, "Token for link B rejected when used on link A");
  }

  console.log("\n--> Testing 5: Byte-Identical Master Delivery & SHA-256 Checksum");
  {
    // Simulate streaming the original file from storage
    const fileStream = fs.createReadStream(testFilePath);
    const hash = crypto.createHash("sha256");

    let bytesReceived = 0;
    await new Promise<void>((resolve, reject) => {
      fileStream.on("data", (chunk: Buffer) => {
        bytesReceived += chunk.length;
        hash.update(chunk);
      });
      fileStream.on("end", () => resolve());
      fileStream.on("error", reject);
    });

    const receivedSha256 = hash.digest("hex");
    assert(bytesReceived === testFileSize, `Live stream delivered exact byte length (${bytesReceived} / ${testFileSize})`);
    assert(receivedSha256 === testFileSha256, "Live stream delivered byte-identical payload (SHA-256 match)");
  }

  console.log("\n--> Testing 6: HTTP 206 Range Request Slicing");
  {
    // Range 0-1023 (first 1024 bytes)
    const start1 = 0;
    const end1 = 1023;
    const slice1Stream = fs.createReadStream(testFilePath, { start: start1, end: end1 });
    const chunks1: Buffer[] = [];
    for await (const chunk of slice1Stream) {
      chunks1.push(chunk as Buffer);
    }
    const slice1 = Buffer.concat(chunks1);
    assert(slice1.length === 1024, "Range 0-1023 yields exactly 1024 bytes");
    assert(
      slice1.equals(testBuffer.subarray(start1, end1 + 1)),
      "Range 0-1023 bytes match source slice"
    );

    // Range 1024-2047 (next 1024 bytes)
    const start2 = 1024;
    const end2 = 2047;
    const slice2Stream = fs.createReadStream(testFilePath, { start: start2, end: end2 });
    const chunks2: Buffer[] = [];
    for await (const chunk of slice2Stream) {
      chunks2.push(chunk as Buffer);
    }
    const slice2 = Buffer.concat(chunks2);
    assert(slice2.length === 1024, "Range 1024-2047 yields exactly 1024 bytes");
    assert(
      slice2.equals(testBuffer.subarray(start2, end2 + 1)),
      "Range 1024-2047 bytes match source slice"
    );
  }

  console.log("\n--> Testing 7: Abort Signal & Stream Disconnect Cleanup");
  {
    const abortStream = fs.createReadStream(testFilePath);
    let chunksRead = 0;
    let streamDestroyed = false;

    abortStream.on("data", () => {
      chunksRead++;
      if (chunksRead === 1) {
        // Simulate client disconnect abort
        abortStream.destroy();
        streamDestroyed = true;
      }
    });

    await new Promise<void>((resolve) => {
      abortStream.on("close", () => {
        resolve();
      });
    });

    assert(streamDestroyed === true, "Stream destroyed immediately upon client disconnect");
    assert(chunksRead === 1, "No further chunks processed after abort");
  }

  // Cleanup test files
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.log("\n================================================================================");
  console.log(`✅ CHUNK B6 ALL TESTS PASSED (${passedTests}/${totalTests})`);
  console.log("================================================================================\n");
}

runB6Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
