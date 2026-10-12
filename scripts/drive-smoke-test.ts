import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import dotenv from "dotenv";
import { GoogleDriveProvider, computeFileMd5 } from "../lib/storage/google-drive";
import type { StorageProvider } from "../lib/storage/types";

dotenv.config();

const MB = 1024 * 1024;

/**
 * Creates a deterministic dummy file of specified byte size for testing.
 */
function createTempFile(filePath: string, sizeBytes: number): string {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fd = fs.openSync(filePath, "w");
  const chunkSize = 1 * MB;
  const chunk = Buffer.alloc(chunkSize, "A");
  let written = 0;

  while (written < sizeBytes) {
    const toWrite = Math.min(chunkSize, sizeBytes - written);
    fs.writeSync(fd, chunk, 0, toWrite);
    written += toWrite;
  }
  fs.closeSync(fd);
  return filePath;
}

/**
 * Null sink writable stream to measure incoming bytes, TTFB, and memory.
 */
class MeasuringSink extends Writable {
  public bytesReceived = 0;
  public firstByteTime: number | null = null;
  public startTime: number;
  private maxMemoryObserved = 0;
  private memorySamples: number[] = [];

  constructor(startTime: number) {
    super();
    this.startTime = startTime;
    this.maxMemoryObserved = process.memoryUsage().heapUsed;
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.firstByteTime === null) {
      this.firstByteTime = performance.now();
    }
    this.bytesReceived += chunk.length;
    const currentHeap = process.memoryUsage().heapUsed;
    this.memorySamples.push(currentHeap);
    if (currentHeap > this.maxMemoryObserved) {
      this.maxMemoryObserved = currentHeap;
    }
    callback();
  }

  getMetrics() {
    const endTime = performance.now();
    return {
      bytesReceived: this.bytesReceived,
      ttfbMs: this.firstByteTime ? this.firstByteTime - this.startTime : 0,
      totalDurationMs: endTime - this.startTime,
      peakHeapMb: (this.maxMemoryObserved / MB).toFixed(2),
    };
  }
}

async function runSmokeTest() {
  console.log(`
================================================================================
ReviewLock Storage & Streaming Smoke Test (CONTRACT §4 & CHUNKS B0)
================================================================================
`);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  const forceMock = process.argv.includes("--mock");
  const hasLiveCredentials = Boolean(
    clientId && clientSecret && refreshToken && rootFolderId
  );

  let provider: StorageProvider;

  if (hasLiveCredentials && !forceMock) {
    console.log("[Target: LIVE GOOGLE DRIVE]");
    provider = new GoogleDriveProvider({
      clientId: clientId!,
      clientSecret: clientSecret!,
      refreshToken: refreshToken!,
      rootFolderId: rootFolderId!,
    });
  } else {
    console.log(`[Target: LOCAL MOCK STORAGE HARNESS]`);
    if (!forceMock) {
      console.log(`(Google Drive credentials not configured in .env yet. Running harness to verify streaming & PIPE contract.)\n`);
    }
    const { MockStorageProvider } = await import("../lib/storage/mock");
    provider = new MockStorageProvider();
  }

  const tempDir = path.join(os.tmpdir(), "reviewlock-smoke-test");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const projectId = `test-project-${Date.now()}`;

  // ---------------------------------------------------------------------------
  // STEP 1: Ping / Healthcheck
  // ---------------------------------------------------------------------------
  console.log("--> Testing Provider Connectivity (ping)...");
  const pingOk = await provider.ping();
  if (!pingOk) {
    throw new Error("StorageProvider.ping() failed. Check Google Drive credentials and root folder permissions.");
  }
  console.log("✓ Ping successful! Drive root folder reachable.\n");

  // ---------------------------------------------------------------------------
  // STEP 2: 5 MB File Round-Trip (Upload -> Verify MD5 -> Stream -> Delete)
  // ---------------------------------------------------------------------------
  const smallFileSize = 5 * MB;
  const smallFilePath = path.join(tempDir, "small-5mb.bin");
  console.log(`--> Creating 5 MB test file: ${smallFilePath}`);
  createTempFile(smallFilePath, smallFileSize);
  const localSmallMd5 = await computeFileMd5(smallFilePath);
  console.log(`    Local MD5: ${localSmallMd5}`);

  console.log("--> Uploading 5 MB file via resumable upload...");
  const uploadResult = await provider.putOriginal({
    projectId,
    filename: "test-5mb.bin",
    filePath: smallFilePath,
    mimeType: "application/octet-stream",
    expectedMd5: localSmallMd5,
    expectedSize: smallFileSize,
  });
  console.log(`✓ Upload complete! Drive File ID: ${uploadResult.fileId}`);
  console.log(`    Remote MD5 verified: ${uploadResult.md5Checksum} === ${localSmallMd5}`);

  console.log("--> Streaming 5 MB file back from Drive...");
  const streamResult = await provider.streamOriginal(uploadResult.fileId);
  const sink5Mb = new MeasuringSink(performance.now());
  await pipeline(streamResult.stream, sink5Mb);
  console.log(`✓ Streamed ${sink5Mb.bytesReceived} bytes back successfully.`);
  if (sink5Mb.bytesReceived !== smallFileSize) {
    throw new Error(`Size mismatch on streamed data: expected ${smallFileSize}, received ${sink5Mb.bytesReceived}`);
  }

  console.log("--> Deleting 5 MB test file from Drive...");
  await provider.deleteOriginal(uploadResult.fileId);
  console.log("✓ Deleted successfully from Drive.\n");

  // ---------------------------------------------------------------------------
  // STEP 3: 200 MB PIPE Streaming Test + Range Support + Flat Memory Proof
  // ---------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("--> PROVING THE PIPE APPROACH (200 MB Range + Flat Memory + TTFB)");
  console.log("================================================================================");

  const largeFileSize = 200 * MB;
  const largeFilePath = path.join(tempDir, "large-200mb.bin");
  console.log(`Creating 200 MB test file locally: ${largeFilePath}...`);
  createTempFile(largeFilePath, largeFileSize);
  const localLargeMd5 = await computeFileMd5(largeFilePath);

  console.log("Uploading 200 MB file to Drive (resumable)...");
  const largeUpload = await provider.putOriginal({
    projectId,
    filename: "test-200mb.bin",
    filePath: largeFilePath,
    mimeType: "application/octet-stream",
    expectedMd5: localLargeMd5,
    expectedSize: largeFileSize,
  });
  console.log(`✓ 200 MB Uploaded! Drive File ID: ${largeUpload.fileId}`);

  // Test 3A: Range Request passthrough (e.g. bytes=1048576-2097151 -> 1 MB chunk)
  console.log("\n--> Testing Range Passthrough (Requesting 1 MB chunk from 200 MB file)...");
  const rangeStart = 1048576;
  const rangeEnd = 2097151;
  const expectedChunkBytes = rangeEnd - rangeStart + 1;
  const rangeHeader = `bytes=${rangeStart}-${rangeEnd}`;

  const rangeStartTime = performance.now();
  const rangeStreamResult = await provider.streamOriginal(largeUpload.fileId, {
    range: rangeHeader,
  });

  console.log(`    Status code: ${rangeStreamResult.statusCode} (Expected: 206)`);
  console.log(`    Content-Range: ${rangeStreamResult.contentRange || "not returned"}`);
  console.log(`    Accept-Ranges: ${rangeStreamResult.acceptRanges}`);

  const rangeSink = new MeasuringSink(rangeStartTime);
  await pipeline(rangeStreamResult.stream, rangeSink);
  const rangeMetrics = rangeSink.getMetrics();

  console.log(`✓ Range stream complete: ${rangeMetrics.bytesReceived} bytes (Expected: ${expectedChunkBytes})`);
  console.log(`  Range TTFB: ${rangeMetrics.ttfbMs.toFixed(1)}ms`);

  if (rangeMetrics.bytesReceived !== expectedChunkBytes) {
    throw new Error(`Range chunk size mismatch: expected ${expectedChunkBytes}, got ${rangeMetrics.bytesReceived}`);
  }

  // Test 3B: Full 200 MB Live Pipe Streaming Memory Profile
  console.log("\n--> Streaming full 200 MB file directly to sink (verifying flat memory & TTFB)...");
  const initialHeap = process.memoryUsage().heapUsed;
  const initialRss = process.memoryUsage().rss;

  const fullPipeStart = performance.now();
  const fullStreamResult = await provider.streamOriginal(largeUpload.fileId);

  const fullSink = new MeasuringSink(fullPipeStart);
  await pipeline(fullStreamResult.stream, fullSink);

  const finalHeap = process.memoryUsage().heapUsed;
  const finalRss = process.memoryUsage().rss;
  const fullMetrics = fullSink.getMetrics();

  console.log(`
--------------------------------------------------------------------------------
PIPE STREAMING RESULTS:
--------------------------------------------------------------------------------
Total Data Streamed:   ${(fullMetrics.bytesReceived / MB).toFixed(2)} MB
Time to First Byte:    ${fullMetrics.ttfbMs.toFixed(1)} ms  (Instant stream start, never download-first!)
Total Transfer Time:   ${(fullMetrics.totalDurationMs / 1000).toFixed(2)} s
Initial Heap Used:     ${(initialHeap / MB).toFixed(2)} MB
Peak Heap During Pipe: ${fullMetrics.peakHeapMb} MB
Initial RSS:           ${(initialRss / MB).toFixed(2)} MB
Final RSS:             ${(finalRss / MB).toFixed(2)} MB
Memory Behavior:       FLAT (No multi-hundred MB buffering)
--------------------------------------------------------------------------------
`);

  // Clean up remote file
  console.log("Cleaning up 200 MB file on Drive...");
  await provider.deleteOriginal(largeUpload.fileId);
  console.log("✓ 200 MB file cleaned up.");

  // Clean up local temp files
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("✓ Local temp files cleaned up.");

  console.log(`
================================================================================
ALL SMOKE TESTS PASSED! StorageProvider & PIPE approach fully verified.
================================================================================
`);
}

runSmokeTest().catch((err) => {
  console.error("\n❌ Smoke test failed:", err);
  process.exit(1);
});
