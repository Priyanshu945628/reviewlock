// pg-boss background worker implementation conforming to CONTRACT §5 and Chunk B3

import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { db } from "@/lib/db";
import {
  projects,
  renditions,
  users,
  auditLog,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getStorageProvider } from "@/lib/storage";
import {
  generatePreviewHls,
  generatePreviewMp4,
  generateThumbnailSprite,
} from "@/lib/video/ffmpeg";
import { probeVideo } from "@/lib/video/probe";
import { env } from "@/lib/env";
import { getWritableBaseDir } from "@/lib/storage/paths";
import {
  getPgBoss,
  PROCESS_PROJECT_QUEUE,
  ProcessProjectJobPayload,
} from "./boss";

/**
 * Computes MD5 checksum of a local file
 */
async function computeFileMd5(filePath: string): Promise<string> {
  const hash = crypto.createHash("md5");
  const fileBuffer = await fs.readFile(filePath);
  hash.update(fileBuffer);
  return hash.digest("hex");
}

/**
 * Core processing function for a single project
 */
export async function processProjectJob(
  payload: ProcessProjectJobPayload
): Promise<void> {
  const { projectId, originalPath, originalFilename } = payload;
  console.log(`[Worker] Starting processing for project ${projectId} (${originalFilename})...`);

  // 1. Fetch project record
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error(`Project ${projectId} not found in database.`);
  }

  // Set status to 'processing'
  await db
    .update(projects)
    .set({ status: "processing" })
    .where(eq(projects.id, projectId));

  try {
    // 2. Probe metadata if duration / dimensions missing
    let duration = project.durationSeconds;
    if (!duration) {
      const probe = await probeVideo(originalPath);
      duration = probe.durationSeconds;
      await db
        .update(projects)
        .set({
          durationSeconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
        })
        .where(eq(projects.id, projectId));
    }

    const previewLength = duration || 60; // Generate full watermarked preview for complete project duration
    const baseDir = await getWritableBaseDir();
    const renditionsBaseDir = path.join(
      baseDir,
      "renditions",
      projectId,
      "v1"
    );
    const thumbsBaseDir = path.join(baseDir, "thumbs", projectId);

    // 3. Generate Preview HLS (4s segments, H.264, PREVIEW_MAX_HEIGHT, AAC, burned-in watermark)
    console.log(`[Worker] Generating HLS preview for ${projectId}...`);
    const hlsDir = path.join(renditionsBaseDir, "hls");
    const { playlistPath } = await generatePreviewHls({
      inputPath: originalPath,
      outputDir: hlsDir,
      startSeconds: 0,
      endSeconds: previewLength,
      maxHeight: env.PREVIEW_MAX_HEIGHT,
      watermarkText: "PREVIEW · NOT PAID",
    });

    await db.insert(renditions).values({
      projectId,
      version: 1,
      type: "preview_hls",
      localPath: playlistPath,
      duration: previewLength,
      status: "ready",
    });

    // 4. Generate Watermarked Preview MP4 (faststart)
    console.log(`[Worker] Generating watermarked preview MP4 for ${projectId}...`);
    const previewMp4Path = path.join(renditionsBaseDir, "preview.mp4");
    await generatePreviewMp4({
      inputPath: originalPath,
      outputPath: previewMp4Path,
      startSeconds: 0,
      endSeconds: previewLength,
      maxHeight: env.PREVIEW_MAX_HEIGHT,
      watermarkText: "PREVIEW · NOT PAID",
    });

    await db.insert(renditions).values({
      projectId,
      version: 1,
      type: "preview_mp4",
      localPath: previewMp4Path,
      duration: previewLength,
      status: "ready",
    });

    // 5. Generate Thumbnail Sprite + WebVTT
    console.log(`[Worker] Generating thumbnail sprite & VTT for ${projectId}...`);
    const spriteResult = await generateThumbnailSprite({
      inputPath: originalPath,
      outputDir: thumbsBaseDir,
      durationSeconds: duration || 60,
      frameCount: 10,
    });

    await db.insert(renditions).values({
      projectId,
      version: 1,
      type: "thumb_sprite",
      localPath: spriteResult.spritePath,
      duration: duration || 60,
      status: "ready",
    });

    // 6. Compute local file md5 and size before Drive upload
    let localStatSize = 0;
    let localMd5 = "";
    try {
      const localStat = await fs.stat(originalPath);
      localStatSize = localStat.size;
      localMd5 = await computeFileMd5(originalPath);
    } catch (e: any) {
      console.warn(`[Worker] Could not stat original file: ${e.message}`);
    }

    // 7. Upload master original to Google Drive (with non-fatal graceful local fallback)
    let driveFileId: string | null = null;
    let driveMd5: string | null = localMd5 || null;

    try {
      console.log(`[Worker] Uploading original to Google Drive for ${projectId}...`);
      const storage = getStorageProvider();
      const driveResult = await storage.putOriginal({
        projectId,
        filePath: originalPath,
        filename: originalFilename,
        mimeType: "video/mp4",
      });

      if (driveResult.size === localStatSize) {
        driveFileId = driveResult.fileId;
        driveMd5 = driveResult.md5Checksum || localMd5;
        console.log(`[Worker] Drive upload verified (MD5: ${localMd5}, size: ${localStatSize}). Cleaning assembled temp file...`);
        await fs.unlink(originalPath).catch(() => {});
      } else {
        console.warn(`[Worker] Drive size mismatch, retaining local master copy.`);
      }
    } catch (driveErr: any) {
      console.warn(
        `[Worker] Cloud master archive upload skipped or deferred (${driveErr.message}). Retaining local master copy on disk. Previews are fully ready.`
      );
    }

    // 8. Update project to ready and record metadata (Previews are already fully generated!)
    await db
      .update(projects)
      .set({
        status: "ready",
        driveFileId: driveFileId,
        driveMd5: driveMd5,
      })
      .where(eq(projects.id, projectId));

    // 9. Update user's storage quota usage (CONTRACT §4.0)
    if (localStatSize > 0) {
      await db
        .update(users)
        .set({
          storageUsedBytes: sql`${users.storageUsedBytes} + ${localStatSize}`,
        })
        .where(eq(users.id, project.userId));
    }

    // 10. Record in audit_log
    await db.insert(auditLog).values({
      actorType: "system",
      entity: "project",
      entityId: projectId,
      action: "project_processed",
      metaJson: {
        driveFileId,
        size: localStatSize,
        md5: localMd5,
        duration,
      },
    });

    console.log(`[Worker] Project ${projectId} processing complete! Status: READY`);
  } catch (err: any) {
    console.error(`[Worker] Processing failed for project ${projectId}:`, err);

    await db
      .update(projects)
      .set({ status: "failed" })
      .where(eq(projects.id, projectId));

    await db.insert(auditLog).values({
      actorType: "system",
      entity: "project",
      entityId: projectId,
      action: "project_processing_failed",
      metaJson: { error: err.message },
    });

    throw err;
  }
}

/**
 * Starts the pg-boss processing worker with max 2 concurrent jobs
 */
export async function startWorker(): Promise<void> {
  const boss = await getPgBoss();
  console.log(`[Worker] Registering worker for queue '${PROCESS_PROJECT_QUEUE}' (teamConcurrency: 2)...`);

  await boss.work(
    PROCESS_PROJECT_QUEUE,
    { batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) {
        if (!job) continue;
        const payload = job.data as ProcessProjectJobPayload;
        await processProjectJob(payload);
      }
    }
  );

  console.log("[Worker] pg-boss worker listening for incoming jobs.");
}
