// POST /api/uploads/:id/complete conforming to CONTRACT §5 and §9

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs, createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db, ensureDbReady } from "@/lib/db";
import { uploadSessions, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { probeVideo } from "@/lib/video/probe";
import { enqueueProcessProject } from "@/lib/queue/boss";
import { getUploadSessionDir } from "@/lib/storage/paths";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDbReady();
  const { id: uploadId } = await params;
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  // 1. Fetch upload session and project
  const [record] = await db
    .select({
      uploadId: uploadSessions.id,
      projectId: projects.id,
      userId: projects.userId,
      originalFilename: projects.originalFilename,
      totalSize: uploadSessions.totalSize,
      chunkSize: uploadSessions.chunkSize,
      receivedChunksJson: uploadSessions.receivedChunksJson,
      uploadStatus: uploadSessions.status,
    })
    .from(uploadSessions)
    .innerJoin(projects, eq(uploadSessions.projectId, projects.id))
    .where(eq(uploadSessions.id, uploadId))
    .limit(1);

  if (!record) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Upload session not found." } },
      { status: 404 }
    );
  }

  if (record.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Access denied." } },
      { status: 403 }
    );
  }

  if (record.uploadStatus !== "active") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPLOAD_NOT_ACTIVE",
          message: `Upload session is already ${record.uploadStatus}.`,
        },
      },
      { status: 400 }
    );
  }

  // 2. Verify all expected chunks are present
  const totalChunks = Math.ceil(record.totalSize / record.chunkSize);
  const receivedChunks: number[] = Array.isArray(record.receivedChunksJson)
    ? (record.receivedChunksJson as number[])
    : [];

  const receivedSet = new Set(receivedChunks);
  const missingChunks: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!receivedSet.has(i)) {
      missingChunks.push(i);
    }
  }

  if (missingChunks.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CHUNKS_MISSING",
          message: `Missing ${missingChunks.length} chunks out of ${totalChunks}.`,
        },
      },
      { status: 400 }
    );
  }

  const uploadDir = await getUploadSessionDir(uploadId);
  const ext = path.extname(record.originalFilename).toLowerCase() || ".mp4";
  const assembledFilePath = path.join(uploadDir, `original${ext}`);

  try {
    // 3. Assemble chunks in sequential order into destination file
    const outputStream = createWriteStream(assembledFilePath);
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(uploadDir, `chunk_${i}.part`);
      const inputStream = createReadStream(partPath);
      await pipeline(inputStream, outputStream, { end: false });
    }
    outputStream.end();

    // Verify size matches expected total size
    const stat = await fs.stat(assembledFilePath);
    if (stat.size !== record.totalSize) {
      await fs.unlink(assembledFilePath).catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "SIZE_MISMATCH",
            message: `Assembled file size (${stat.size} bytes) does not match expected (${record.totalSize} bytes).`,
          },
        },
        { status: 400 }
      );
    }

    // 4. Delete the .part files immediately
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(uploadDir, `chunk_${i}.part`);
      await fs.unlink(partPath).catch(() => {});
    }

    // 5. ffprobe validation (CONTRACT §5)
    let probeResult;
    try {
      probeResult = await probeVideo(assembledFilePath);
    } catch (probeErr: any) {
      // Not a valid video stream
      await fs.unlink(assembledFilePath).catch(() => {});
      await db
        .update(projects)
        .set({ status: "failed" })
        .where(eq(projects.id, record.projectId));

      await db
        .update(uploadSessions)
        .set({ status: "aborted" })
        .where(eq(uploadSessions.id, uploadId));

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_VIDEO",
            message: probeErr.message || "File is not a valid video stream.",
          },
        },
        { status: 400 }
      );
    }

    // 6. Update Project with metadata & status 'uploaded'
    await db
      .update(projects)
      .set({
        durationSeconds: probeResult.durationSeconds,
        width: probeResult.width,
        height: probeResult.height,
        status: "uploaded",
      })
      .where(eq(projects.id, record.projectId));

    // 7. Update upload session as completed
    await db
      .update(uploadSessions)
      .set({ status: "completed" })
      .where(eq(uploadSessions.id, uploadId));

    // 8. Trigger processing immediately at upload time in background
    // This ensures HLS, MP4 previews, and sprites are created within seconds of upload,
    // so editor & client never have to wait!
    import("@/lib/queue/worker")
      .then(({ processProjectJob }) => {
        processProjectJob({
          projectId: record.projectId,
          uploadId,
          originalPath: assembledFilePath,
          originalFilename: record.originalFilename,
        }).catch((err) =>
          console.error("[UploadComplete] Direct processing error:", err)
        );
      })
      .catch((err) =>
        console.error("[UploadComplete] Worker import error:", err)
      );

    // Also enqueue to pg-boss as safety backup
    try {
      await enqueueProcessProject({
        projectId: record.projectId,
        uploadId,
        originalPath: assembledFilePath,
        originalFilename: record.originalFilename,
      });
    } catch {
      // Direct processing is already running above
    }

    return NextResponse.json({
      ok: true,
      data: {
        projectId: record.projectId,
        status: "uploaded",
        durationSeconds: probeResult.durationSeconds,
        resolution: `${probeResult.width}x${probeResult.height}`,
      },
    });
  } catch (err: any) {
    console.error("[UploadComplete] Assembly error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ASSEMBLY_FAILED",
          message: err.message || "Failed to assemble upload chunks.",
        },
      },
      { status: 500 }
    );
  }
}
