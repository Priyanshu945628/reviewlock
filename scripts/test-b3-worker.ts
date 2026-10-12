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
process.env.DATA_DIR = path.join(process.cwd(), ".tmp-test-b3");
process.env.STORAGE_PROVIDER = "mock";
(process.env as any).NODE_ENV = "test";
process.env.PREVIEW_MAX_HEIGHT = "720";

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
import {
  generatePreviewHls,
  generatePreviewMp4,
  generateThumbnailSprite,
} from "../lib/video/ffmpeg";
import { probeVideo } from "../lib/video/probe";
import { processProjectJob } from "../lib/queue/worker";

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

async function runB3Tests() {
  console.log("================================================================================");
  console.log("ReviewLock FFmpeg & Processing Worker Verification Suite (CHUNK B3)");
  console.log("================================================================================");

  const testDb = await setupInMemoryDatabase();
  console.log("✓ In-memory database initialized for B3 tests.");

  // Prepare test directories & sample video
  fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
  const sampleVideoPath = path.join(process.env.DATA_DIR!, "sample_b3.mp4");

  console.log("\n--> Generating 2-second test video with FFmpeg...");
  execSync(
    `ffmpeg -y -f lavfi -i testsrc=duration=2:size=640x360:rate=24 -f lavfi -i sine=frequency=1000:duration=2 -c:v libx264 -preset ultrafast -c:a aac "${sampleVideoPath}"`,
    { stdio: "ignore" }
  );
  assert.strictEqual(fs.existsSync(sampleVideoPath), true);
  console.log("✓ Sample test video created:", sampleVideoPath);

  // ---------------------------------------------------------------------------
  // TEST 1: HLS preview generation
  // ---------------------------------------------------------------------------
  console.log("\n--> 1. Testing generatePreviewHls (4s segments, drawtext watermark, H.264)...");
  const hlsOutDir = path.join(process.env.DATA_DIR!, "test_hls");
  const { playlistPath } = await generatePreviewHls({
    inputPath: sampleVideoPath,
    outputDir: hlsOutDir,
    startSeconds: 0,
    endSeconds: 2,
    maxHeight: 720,
    watermarkText: "PREVIEW · NOT PAID",
  });

  assert.strictEqual(fs.existsSync(playlistPath), true, "master.m3u8 playlist must exist");
  const playlistContent = fs.readFileSync(playlistPath, "utf-8");
  assert.strictEqual(playlistContent.includes("#EXTM3U"), true);
  assert.strictEqual(playlistContent.includes(".ts"), true);

  const segment0 = path.join(hlsOutDir, "seg_000.ts");
  assert.strictEqual(fs.existsSync(segment0), true, "seg_000.ts segment must exist");
  console.log("✓ HLS master.m3u8 and .ts segments generated successfully.");

  // ---------------------------------------------------------------------------
  // TEST 2: MP4 preview generation
  // ---------------------------------------------------------------------------
  console.log("\n--> 2. Testing generatePreviewMp4 (watermarked preview MP4 with faststart)...");
  const mp4OutPath = path.join(process.env.DATA_DIR!, "test_preview.mp4");
  await generatePreviewMp4({
    inputPath: sampleVideoPath,
    outputPath: mp4OutPath,
    startSeconds: 0,
    endSeconds: 2,
    watermarkText: "PREVIEW · NOT PAID",
  });

  assert.strictEqual(fs.existsSync(mp4OutPath), true);
  const mp4Probe = await probeVideo(mp4OutPath);
  assert.strictEqual(mp4Probe.videoCodec, "h264");
  console.log("✓ Watermarked preview MP4 generated and validated via ffprobe:", mp4Probe.videoCodec);

  // ---------------------------------------------------------------------------
  // TEST 3: Thumbnail sprite & WebVTT generation
  // ---------------------------------------------------------------------------
  console.log("\n--> 3. Testing generateThumbnailSprite (10-frame horizontal sprite + WebVTT)...");
  const spriteOutDir = path.join(process.env.DATA_DIR!, "test_thumbs");
  const spriteResult = await generateThumbnailSprite({
    inputPath: sampleVideoPath,
    outputDir: spriteOutDir,
    durationSeconds: 2,
    frameCount: 10,
  });

  assert.strictEqual(fs.existsSync(spriteResult.spritePath), true);
  assert.strictEqual(fs.existsSync(spriteResult.vttPath), true);
  const vttContent = fs.readFileSync(spriteResult.vttPath, "utf-8");
  assert.strictEqual(vttContent.includes("WEBVTT"), true);
  assert.strictEqual(vttContent.includes("sprite.jpg#xywh="), true);
  console.log("✓ Thumbnail sprite sheet and WebVTT indexing generated successfully.");

  // ---------------------------------------------------------------------------
  // TEST 4: Full project processing worker flow
  // ---------------------------------------------------------------------------
  console.log("\n--> 4. Testing processProjectJob end-to-end flow...");
  const userId = crypto.randomUUID();
  await testDb.insert(schema.users).values({
    id: userId,
    email: "editor_b3@reviewlock.io",
    passwordHash: "hash",
    displayName: "Editor B3",
    storageUsedBytes: 0,
  });

  const projectId = crypto.randomUUID();
  const testOriginalCopy = path.join(process.env.DATA_DIR!, `orig_${projectId}.mp4`);
  fs.copyFileSync(sampleVideoPath, testOriginalCopy);
  const originalSize = fs.statSync(testOriginalCopy).size;

  await testDb.insert(schema.projects).values({
    id: projectId,
    userId,
    title: "Wedding_Reel_Test.mp4",
    status: "uploaded",
    originalFilename: "Wedding_Reel_Test.mp4",
    originalSize,
    durationSeconds: 2,
    width: 640,
    height: 360,
  });

  // Execute processing job
  await processProjectJob({
    projectId,
    uploadId: "mock_upload_001",
    originalPath: testOriginalCopy,
    originalFilename: "Wedding_Reel_Test.mp4",
  });

  // Verify project updated to READY with Drive metadata
  const [updatedProject] = await testDb
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId));

  assert.strictEqual(updatedProject.status, "ready");
  assert.strictEqual(typeof updatedProject.driveFileId, "string");
  assert.strictEqual(typeof updatedProject.driveMd5, "string");
  console.log("✓ Project status transitioned to READY with Drive file ID:", updatedProject.driveFileId);

  // Verify renditions created
  const renditionsList = await testDb
    .select()
    .from(schema.renditions)
    .where(eq(schema.renditions.projectId, projectId));

  assert.strictEqual(renditionsList.length >= 3, true);
  const types = renditionsList.map((r) => r.type);
  assert.strictEqual(types.includes("preview_hls"), true);
  assert.strictEqual(types.includes("preview_mp4"), true);
  assert.strictEqual(types.includes("thumb_sprite"), true);
  console.log("✓ All 3 renditions recorded in database:", types);

  // Verify local original deleted (CONTRACT §5)
  assert.strictEqual(fs.existsSync(testOriginalCopy), false, "Local original must be deleted after Drive upload");
  console.log("✓ Local original deleted from disk after Drive verification.");

  // Verify user storage quota incremented
  const [updatedUser] = await testDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  assert.strictEqual(updatedUser.storageUsedBytes, originalSize);
  console.log(`✓ User storage quota updated: ${updatedUser.storageUsedBytes} bytes.`);

  // Verify audit log entry
  const [logEntry] = await testDb
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, projectId));

  assert.strictEqual(logEntry.action, "project_processed");
  console.log("✓ Audit log entry recorded with action:", logEntry.action);

  // ---------------------------------------------------------------------------
  // TEST 5: Processing error handling
  // ---------------------------------------------------------------------------
  console.log("\n--> 5. Testing worker failure handling on missing file...");
  const failedProjectId = crypto.randomUUID();
  await testDb.insert(schema.projects).values({
    id: failedProjectId,
    userId,
    title: "Missing_File.mp4",
    status: "uploaded",
    originalFilename: "Missing_File.mp4",
    originalSize: 100,
  });

  try {
    await processProjectJob({
      projectId: failedProjectId,
      uploadId: "mock_upload_002",
      originalPath: path.join(process.env.DATA_DIR!, "non_existent.mp4"),
      originalFilename: "Missing_File.mp4",
    });
    assert.fail("Should have thrown on missing file");
  } catch (err: any) {
    const [failedProject] = await testDb
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, failedProjectId));

    assert.strictEqual(failedProject.status, "failed");
    console.log("✓ Project correctly transitioned to FAILED status upon processing error.");
  }

  // Cleanup test directory
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });

  console.log("\n================================================================================");
  console.log("ALL B3 PROCESSING WORKER & FFMPEG TESTS PASSED!");
  console.log("================================================================================");
}

runB3Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
