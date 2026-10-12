import dotenv from "dotenv";
dotenv.config();

// Ensure test environment variables
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
process.env.DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".tmp-test-data");
process.env.MAX_UPLOAD_GB = "5";
process.env.MAX_STORAGE_PER_USER_GB = "20";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { setTestDb } from "../lib/db";
import { createSession, SESSION_COOKIE_NAME } from "../lib/auth/session";
import { POST as initUpload } from "../app/api/uploads/route";
import { PUT as uploadChunk } from "../app/api/uploads/[id]/chunk/route";
import { GET as getUploadInfo } from "../app/api/uploads/[id]/route";
import { POST as completeUpload } from "../app/api/uploads/[id]/complete/route";
import { GET as getStorage } from "../app/api/me/storage/route";
import { NextRequest } from "next/server";

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

  const testDb = drizzle(pool, { schema });
  setTestDb(testDb as any);

  return testDb;
}

async function runB2Tests() {
  console.log("================================================================================");
  console.log("ReviewLock Upload Pipeline Verification Suite (CHUNK B2)");
  console.log("================================================================================");

  // Setup DB
  const testDb = await setupInMemoryDatabase();
  console.log("✓ In-memory database initialized for B2 tests.");

  // Create test user
  const userId = crypto.randomUUID();
  await testDb.insert(schema.users).values({
    id: userId,
    email: "editor@reviewlock.io",
    passwordHash: "hash",
    displayName: "Editor B2",
    storageUsedBytes: 0,
  });

  // Create session
  const { token: sessionToken } = await createSession(userId);
  const authHeaders = {
    Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
    "Content-Type": "application/json",
  };

  // Ensure test data dir exists
  fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });

  // ---------------------------------------------------------------------------
  // TEST 1: GET /api/me/storage
  // ---------------------------------------------------------------------------
  console.log("\n--> 1. Testing GET /api/me/storage...");
  const storageReq = new NextRequest("http://localhost:3000/api/me/storage", {
    headers: authHeaders,
  });
  const storageRes = await getStorage(storageReq);
  const storageJson = await storageRes.json();
  assert.strictEqual(storageJson.ok, true);
  assert.strictEqual(storageJson.data.usedBytes, 0);
  assert.strictEqual(
    storageJson.data.limitBytes,
    20 * 1024 * 1024 * 1024
  );
  console.log("✓ /api/me/storage returned correct initial quota:", storageJson.data);

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid file extension rejection
  // ---------------------------------------------------------------------------
  console.log("\n--> 2. Testing non-video file extension rejection...");
  const invalidExtReq = new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      filename: "malicious_script.sh",
      size: 1024,
    }),
  });
  const invalidExtRes = await initUpload(invalidExtReq);
  const invalidExtJson = await invalidExtRes.json();
  assert.strictEqual(invalidExtJson.ok, false);
  assert.strictEqual(invalidExtJson.error.code, "INVALID_FILE_TYPE");
  console.log("✓ Correctly rejected .sh file with INVALID_FILE_TYPE:", invalidExtJson.error.message);

  // ---------------------------------------------------------------------------
  // TEST 3: Oversize rejection (MAX_UPLOAD_GB)
  // ---------------------------------------------------------------------------
  console.log("\n--> 3. Testing oversize file rejection (> 5 GB)...");
  const oversizeBytes = 6 * 1024 * 1024 * 1024; // 6 GB > 5 GB max
  const oversizeReq = new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      filename: "huge_video.mp4",
      size: oversizeBytes,
    }),
  });
  const oversizeRes = await initUpload(oversizeReq);
  const oversizeJson = await oversizeRes.json();
  assert.strictEqual(oversizeJson.ok, false);
  assert.strictEqual(oversizeJson.error.code, "FILE_TOO_LARGE");
  console.log("✓ Correctly rejected 6 GB file with FILE_TOO_LARGE:", oversizeJson.error.message);

  // ---------------------------------------------------------------------------
  // TEST 4: Storage Quota Exceeded Rejection
  // ---------------------------------------------------------------------------
  console.log("\n--> 4. Testing per-user storage quota exceeded rejection...");
  // Simulate user already having 18 GB stored
  await testDb
    .update(schema.users)
    .set({ storageUsedBytes: 18 * 1024 * 1024 * 1024 })
    .where(eq(schema.users.id, userId));

  // Attempt to upload 3 GB (18 + 3 = 21 GB > 20 GB limit)
  const quotaReq = new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      filename: "wedding_clip.mov",
      size: 3 * 1024 * 1024 * 1024,
    }),
  });
  const quotaRes = await initUpload(quotaReq);
  const quotaJson = await quotaRes.json();
  assert.strictEqual(quotaJson.ok, false);
  assert.strictEqual(quotaJson.error.code, "STORAGE_QUOTA_EXCEEDED");
  console.log("✓ Correctly rejected upload exceeding user limit with STORAGE_QUOTA_EXCEEDED:", quotaJson.error.message);

  // Reset user storage to 0
  await testDb
    .update(schema.users)
    .set({ storageUsedBytes: 0 })
    .where(eq(schema.users.id, userId));

  // ---------------------------------------------------------------------------
  // TEST 5: Resume after dropped chunk & concurrent chunks
  // ---------------------------------------------------------------------------
  console.log("\n--> 5. Testing chunk upload, dropped chunk resume, and concurrent chunks...");

  // Generate a real 1-second test MP4 using ffmpeg
  const testMp4Path = path.join(process.env.DATA_DIR!, "sample_1s.mp4");
  try {
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=1:size=320x240:rate=24 -f lavfi -i sine=frequency=1000:duration=1 -c:v libx264 -c:a aac "${testMp4Path}"`,
      { stdio: "ignore" }
    );
  } catch (err: any) {
    console.error("Could not run ffmpeg to create sample video:", err.message);
  }

  assert.strictEqual(fs.existsSync(testMp4Path), true, "Sample test video must exist");
  const testVideoBuffer = fs.readFileSync(testMp4Path);
  const totalVideoSize = testVideoBuffer.length;

  // Split into 3 simulated chunks
  const chunkSize = Math.ceil(totalVideoSize / 3);
  const chunk0 = testVideoBuffer.subarray(0, chunkSize);
  const chunk1 = testVideoBuffer.subarray(chunkSize, chunkSize * 2);
  const chunk2 = testVideoBuffer.subarray(chunkSize * 2);

  // Start upload session
  const initReq = new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      filename: "sample_test.mp4",
      size: totalVideoSize,
      chunkSize,
    }),
  });
  const initRes = await initUpload(initReq);
  const initJson = await initRes.json();
  assert.strictEqual(initJson.ok, true);
  const uploadId = initJson.data.uploadId;
  const projectId = initJson.data.projectId;
  console.log("✓ Initialized upload session:", uploadId);

  // Upload chunk 0
  const chunk0Req = new NextRequest(
    `http://localhost:3000/api/uploads/${uploadId}/chunk?index=0`,
    {
      method: "PUT",
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
      body: chunk0,
    }
  );
  const chunk0Res = await uploadChunk(chunk0Req, {
    params: Promise.resolve({ id: uploadId }),
  });
  const chunk0Json = await chunk0Res.json();
  assert.strictEqual(chunk0Json.ok, true);
  assert.strictEqual(chunk0Json.data.receivedChunk, 0);

  // Check resume status: chunk 0 received, chunk 1 & 2 not yet
  const infoReq1 = new NextRequest(
    `http://localhost:3000/api/uploads/${uploadId}`,
    { headers: authHeaders }
  );
  const infoRes1 = await getUploadInfo(infoReq1, {
    params: Promise.resolve({ id: uploadId }),
  });
  const infoJson1 = await infoRes1.json();
  assert.strictEqual(infoJson1.ok, true);
  assert.deepStrictEqual(infoJson1.data.receivedChunks, [0]);
  console.log("✓ Resume status check shows chunk 0 received after network drop");

  // Attempting complete before chunks 1 & 2 must fail with CHUNKS_MISSING
  const prematureCompleteReq = new NextRequest(
    `http://localhost:3000/api/uploads/${uploadId}/complete`,
    { method: "POST", headers: authHeaders }
  );
  const prematureCompleteRes = await completeUpload(prematureCompleteReq, {
    params: Promise.resolve({ id: uploadId }),
  });
  const prematureJson = await prematureCompleteRes.json();
  assert.strictEqual(prematureJson.ok, false);
  assert.strictEqual(prematureJson.error.code, "CHUNKS_MISSING");
  console.log("✓ Premature completion rejected with CHUNKS_MISSING");

  // Concurrently upload chunk 1 and chunk 2
  console.log("--> Testing concurrent chunk upload (chunks 1 and 2 in parallel)...");
  const [res1, res2] = await Promise.all([
    uploadChunk(
      new NextRequest(
        `http://localhost:3000/api/uploads/${uploadId}/chunk?index=1`,
        {
          method: "PUT",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
          body: chunk1,
        }
      ),
      { params: Promise.resolve({ id: uploadId }) }
    ),
    uploadChunk(
      new NextRequest(
        `http://localhost:3000/api/uploads/${uploadId}/chunk?index=2`,
        {
          method: "PUT",
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
          body: chunk2,
        }
      ),
      { params: Promise.resolve({ id: uploadId }) }
    ),
  ]);

  assert.strictEqual((await res1.json()).ok, true);
  assert.strictEqual((await res2.json()).ok, true);

  // Verify all 3 chunks now recorded in DB
  const infoReq2 = new NextRequest(
    `http://localhost:3000/api/uploads/${uploadId}`,
    { headers: authHeaders }
  );
  const infoRes2 = await getUploadInfo(infoReq2, {
    params: Promise.resolve({ id: uploadId }),
  });
  const infoJson2 = await infoRes2.json();
  assert.strictEqual(infoJson2.ok, true);
  assert.deepStrictEqual(infoJson2.data.receivedChunks, [0, 1, 2]);
  console.log("✓ All 3 chunks received without race condition:", infoJson2.data.receivedChunks);

  // Complete assembly and verify ffprobe validation
  console.log("\n--> 6. Testing complete assembly & ffprobe validation on real video...");
  const completeReq = new NextRequest(
    `http://localhost:3000/api/uploads/${uploadId}/complete`,
    { method: "POST", headers: authHeaders }
  );
  const completeRes = await completeUpload(completeReq, {
    params: Promise.resolve({ id: uploadId }),
  });
  const completeJson = await completeRes.json();
  assert.strictEqual(completeJson.ok, true);
  assert.strictEqual(completeJson.data.status, "uploaded");
  assert.strictEqual(completeJson.data.resolution, "320x240");
  assert.strictEqual(typeof completeJson.data.durationSeconds, "number");
  console.log("✓ Complete assembly succeeded with ffprobe validation:", completeJson.data);

  // ---------------------------------------------------------------------------
  // TEST 7: Non-video file disguised with .mp4 extension
  // ---------------------------------------------------------------------------
  console.log("\n--> 7. Testing non-video rejection during ffprobe validation...");
  const fakeInitReq = new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      filename: "fake_video.mp4",
      size: 64,
      chunkSize: 64,
    }),
  });
  const fakeInitRes = await initUpload(fakeInitReq);
  const fakeUploadId = (await fakeInitRes.json()).data.uploadId;

  // Upload non-video binary garbage exactly 64 bytes
  const fakeChunk = Buffer.alloc(64, 0x41); // 64 'A' bytes (not a valid video)
  await uploadChunk(
    new NextRequest(
      `http://localhost:3000/api/uploads/${fakeUploadId}/chunk?index=0`,
      {
        method: "PUT",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
        body: fakeChunk,
      }
    ),
    { params: Promise.resolve({ id: fakeUploadId }) }
  );

  const fakeCompleteRes = await completeUpload(
    new NextRequest(
      `http://localhost:3000/api/uploads/${fakeUploadId}/complete`,
      { method: "POST", headers: authHeaders }
    ),
    { params: Promise.resolve({ id: fakeUploadId }) }
  );
  const fakeCompleteJson = await fakeCompleteRes.json();
  assert.strictEqual(fakeCompleteJson.ok, false);
  assert.strictEqual(fakeCompleteJson.error.code, "INVALID_VIDEO");
  console.log("✓ Non-video rejected during ffprobe assembly with INVALID_VIDEO:", fakeCompleteJson.error.message);

  // Clean up test data dir
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });

  console.log("\n================================================================================");
  console.log("ALL B2 UPLOAD PIPELINE TESTS PASSED!");
  console.log("================================================================================");
}

runB2Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
