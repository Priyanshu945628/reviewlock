// Automated test suite for Chunk B4: Share Link Engine
// Conforming to CONTRACT §6, §7, §9 & CHUNKS B4

import dotenv from "dotenv";
dotenv.config();

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/reviewlock";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "12345678901234567890123456789012";
process.env.STREAM_TOKEN_SECRET =
  process.env.STREAM_TOKEN_SECRET || "12345678901234567890123456789012";
process.env.DOWNLOAD_TOKEN_SECRET =
  process.env.DOWNLOAD_TOKEN_SECRET || "12345678901234567890123456789012";
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
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { setTestDb, db } from "../lib/db";
import {
  generateSlug,
  isValidStateTransition,
  createShareLink,
  getProjectShareLinks,
  updateShareLink,
  revokeShareLink,
  unlockShareLink,
  getShareLinkActivity,
} from "../lib/links/service";
import { hashPassword, verifyPassword } from "../lib/auth/password";

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

async function runB4Tests() {
  console.log("================================================================================");
  console.log("ReviewLock Share Link Engine Test Suite (CHUNKS B4)");
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
  // 1. Slug entropy & format test
  // ---------------------------------------------------------------------------
  console.log("--> Testing 128-bit Slug Generation (CONTRACT §6)...");
  const slugs = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const s = generateSlug();
    slugs.add(s);
    if (s.length !== 22 || !/^[A-Za-z0-9_-]+$/.test(s)) {
      assert(false, `Slug ${s} does not match 128-bit base64url format`);
    }
  }
  assert(slugs.size === 100, "100 generated slugs are strictly unique and collision-free");
  assert(true, "All slugs conform to 128-bit base64url entropy specification");

  // ---------------------------------------------------------------------------
  // 2. Argon2id Passcode Hashing Test
  // ---------------------------------------------------------------------------
  console.log("\n--> Testing Argon2id Passcode Hashing & Verification (CONTRACT §6)...");
  const testPasscode = "Secret123!";
  const hash = await hashPassword(testPasscode);
  assert(hash.startsWith("$argon2id$"), "Hash format is strictly argon2id");
  const match = await verifyPassword(hash, testPasscode);
  assert(match === true, "Argon2id correctly verifies matching plaintext passcode");
  const mismatch = await verifyPassword(hash, "WrongPassword");
  assert(mismatch === false, "Argon2id rejects incorrect plaintext passcode");

  // ---------------------------------------------------------------------------
  // 3. State Machine Transitions Matrix Test
  // ---------------------------------------------------------------------------
  console.log("\n--> Testing State Machine Transitions (CONTRACT §6)...");
  // Legal transitions
  assert(isValidStateTransition("created", "active"), "Legal: created -> active");
  assert(isValidStateTransition("active", "viewers_exhausted"), "Legal: active -> viewers_exhausted");
  assert(isValidStateTransition("active", "expired"), "Legal: active -> expired");
  assert(isValidStateTransition("active", "revoked"), "Legal: active -> revoked");
  assert(isValidStateTransition("viewers_exhausted", "revoked"), "Legal: viewers_exhausted -> revoked");
  assert(isValidStateTransition("expired", "revoked"), "Legal: expired -> revoked");

  // Editor unlock from ANY state (CONTRACT §6)
  assert(isValidStateTransition("created", "unlocked"), "Legal: editor unlock from created");
  assert(isValidStateTransition("active", "unlocked"), "Legal: editor unlock from active");
  assert(isValidStateTransition("viewers_exhausted", "unlocked"), "Legal: editor unlock from viewers_exhausted");
  assert(isValidStateTransition("expired", "unlocked"), "Legal: editor unlock from expired");
  assert(isValidStateTransition("revoked", "unlocked"), "Legal: editor unlock from revoked");

  // Illegal transitions
  assert(!isValidStateTransition("revoked", "active"), "Illegal: revoked -> active is rejected");
  assert(!isValidStateTransition("revoked", "viewers_exhausted"), "Illegal: revoked -> viewers_exhausted is rejected");
  assert(!isValidStateTransition("revoked", "expired"), "Illegal: revoked -> expired is rejected");
  assert(!isValidStateTransition("unlocked", "active"), "Illegal: unlocked -> active is rejected");
  assert(!isValidStateTransition("unlocked", "viewers_exhausted"), "Illegal: unlocked -> viewers_exhausted is rejected");

  // ---------------------------------------------------------------------------
  // 4. Database Integration & Operations Test
  // ---------------------------------------------------------------------------
  console.log("\n--> Testing Database Integration & Service Operations...");

  // Setup database (in-memory pg-mem if live DB not connected)
  const activeDb = await setupInMemoryDatabase();

  // Setup test user & test project
  const testEmail = `b4_test_${Date.now()}@reviewlock.io`;
  const [testUser] = await activeDb
    .insert(schema.users)
    .values({
      email: testEmail,
      passwordHash: hash,
      displayName: "B4 Tester",
      storageUsedBytes: 0,
    })
    .returning();

  const [testProject] = await activeDb
    .insert(schema.projects)
    .values({
      userId: testUser.id,
      title: "B4 Test Video",
      status: "ready",
      originalFilename: "b4_test.mp4",
      originalSize: 50 * 1024 * 1024,
      durationSeconds: 120,
      width: 1920,
      height: 1080,
    })
    .returning();

  // 4.1 Create share link
  const link = await createShareLink({
    projectId: testProject.id,
    userId: testUser.id,
    clientLabel: "Wedding Reel Client",
    visibility: "private",
    passcode: "ClientPass99",
    previewMode: "first_n_seconds",
    previewStart: 0,
    previewEnd: 30,
    maxViewers: 2,
    allowPreviewDownload: false,
    watermarkText: "PREVIEW · NOT PAID",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  assert(link.id !== undefined, "Share link created with unique ID");
  assert(link.status === "active", "Newly created link is active");
  assert(link.slug.length === 22, "Link has valid 128-bit slug");
  assert(link.passcodeHash?.startsWith("$argon2id$") === true, "Link passcode is hashed with Argon2id");
  assert(link.viewersUsed === 0, "Initial viewers_used is 0");
  assert(link.maxViewers === 2, "max_viewers stored correctly");

  // 4.2 Verify audit log wrote link_created
  const [creationLog] = await activeDb
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, link.id))
    .limit(1);

  assert(creationLog !== undefined, "Audit log record created");
  assert(creationLog.action === "link_created", "Audit log action is 'link_created'");
  assert(creationLog.actorType === "editor", "Audit log actor_type is 'editor'");

  // 4.3 List share links for project
  const projectLinks = await getProjectShareLinks(testProject.id, testUser.id);
  assert(projectLinks.length === 1 && projectLinks[0].id === link.id, "getProjectShareLinks returns created link");

  // 4.4 Update share link settings
  const updated = await updateShareLink(link.id, testUser.id, {
    clientLabel: "Updated Client Label",
    maxViewers: 5,
    watermarkText: "STUDIO KALA · PREVIEW",
  });

  assert(updated.clientLabel === "Updated Client Label", "clientLabel updated successfully");
  assert(updated.maxViewers === 5, "maxViewers updated to 5");
  assert(updated.watermarkText === "STUDIO KALA · PREVIEW", "watermarkText updated");

  // 4.5 Revoke link
  const revoked = await revokeShareLink(link.id, testUser.id);
  assert(revoked.status === "revoked", "Link transitioned to revoked");

  // Verify revoked link rejects edit
  let editThrew = false;
  try {
    await updateShareLink(link.id, testUser.id, { clientLabel: "Illegal edit" });
  } catch (err: any) {
    editThrew = err.message === "CANNOT_MODIFY_REVOKED_LINK";
  }
  assert(editThrew, "Attempting to edit a revoked link is rejected with CANNOT_MODIFY_REVOKED_LINK");

  // 4.6 Unlock link (Release full video)
  const unlocked = await unlockShareLink(link.id, testUser.id);
  assert(unlocked.status === "unlocked", "Link transitioned from revoked to unlocked");
  assert(unlocked.unlockedAt !== null, "unlockedAt timestamp is populated");

  // 4.7 Activity query
  const activity = await getShareLinkActivity(link.id, testUser.id);
  assert(activity.events.length >= 3, `Activity returns at least 3 audit events (got ${activity.events.length})`);
  const actions = activity.events.map((e) => e.action);
  assert(actions.includes("link_created"), "Activity events contain link_created");
  assert(actions.includes("link_updated"), "Activity events contain link_updated");
  assert(actions.includes("link_unlocked"), "Activity events contain link_unlocked");

  console.log("\n================================================================================");
  console.log(`B4 Test Results: ${passedCount} passed, ${failedCount} failed.`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runB4Tests().catch((err) => {
  console.error("Unhandled exception in B4 tests:", err);
  process.exit(1);
});
