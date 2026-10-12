// GET /api/v/:slug/download conforming to CONTRACT §4.2, §6, §9 & CHUNKS B6
// Live-pipes full original video from Google Drive with HTTP 206 Range passthrough and flat memory

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import * as fs from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { shareLinks, projects, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateAndConsumeDownloadToken } from "@/lib/download/service";
import { getStorageProvider } from "@/lib/storage";
import { env } from "@/lib/env";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = req.nextUrl.searchParams.get("d");

  if (!token) {
    return new NextResponse("Download token required (?d=...)", { status: 403 });
  }

  // 1. Fetch link and project
  const [link] = await db
    .select({
      id: shareLinks.id,
      slug: shareLinks.slug,
      status: shareLinks.status,
      projectId: shareLinks.projectId,
      projectTitle: projects.title,
      originalFilename: projects.originalFilename,
      originalSize: projects.originalSize,
      driveFileId: projects.driveFileId,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return new NextResponse("Link not found", { status: 404 });
  }

  if (link.status !== "unlocked") {
    return new NextResponse("Link not unlocked for full file download", {
      status: 403,
    });
  }

  // 2. Validate and consume single-use download token (CONTRACT §6 & B6)
  const validation = await validateAndConsumeDownloadToken(token, link.id);
  if (!validation.valid) {
    let msg = "Invalid download token";
    if (validation.error === "TOKEN_EXPIRED") msg = "Download token has expired (5-minute limit)";
    if (validation.error === "TOKEN_ALREADY_USED") msg = "Download token has already been used";
    return new NextResponse(msg, { status: 403 });
  }

  // 3. Log download initiation
  await db.insert(auditLog).values({
    actorType: "viewer",
    entity: "share_link",
    entityId: link.id,
    action: "original_downloaded",
    metaJson: {
      filename: link.originalFilename,
      size: link.originalSize,
      grantId: validation.grantId,
    },
  });

  const rangeHeader = req.headers.get("range") || undefined;
  const cleanFilename = link.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // 4. Live streaming from Google Drive or local master
  if (link.driveFileId) {
    try {
      const storage = getStorageProvider();
      const streamResult = await storage.streamOriginal(link.driveFileId, {
        range: rangeHeader,
        signal: req.signal,
      });

      const nodeStream = streamResult.stream;

      // Wrap Node.js Readable stream into Web ReadableStream with abort handling
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        },
      });

      // Handle client disconnect abort signal
      req.signal?.addEventListener("abort", () => {
        nodeStream.destroy();
      });

      const responseHeaders: Record<string, string> = {
        "Content-Type": streamResult.contentType || "video/mp4",
        "Accept-Ranges": streamResult.acceptRanges || "bytes",
        "Content-Disposition": `attachment; filename="${cleanFilename}"`,
        "Cache-Control": "private, no-cache, no-store",
      };

      if (streamResult.contentLength) {
        responseHeaders["Content-Length"] = String(streamResult.contentLength);
      }
      if (streamResult.contentRange) {
        responseHeaders["Content-Range"] = streamResult.contentRange;
      }

      return new NextResponse(webStream as any, {
        status: streamResult.statusCode || (rangeHeader ? 206 : 200),
        headers: responseHeaders,
      });
    } catch (err: any) {
      console.error("[Download] Drive stream error:", err);
      return new NextResponse("Failed to stream original from storage", {
        status: 502,
      });
    }
  }

  // Fallback: If original is available locally in uploads directory
  const localOriginalPath = path.join(
    env.DATA_DIR,
    "uploads",
    link.projectId,
    link.originalFilename
  );

  if (fs.existsSync(localOriginalPath)) {
    const stat = fs.statSync(localOriginalPath);
    const fileSize = stat.size;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(localOriginalPath, { start, end });

      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
        cancel() {
          fileStream.destroy();
        },
      });

      return new NextResponse(webStream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${cleanFilename}"`,
        },
      });
    } else {
      const fileStream = fs.createReadStream(localOriginalPath);
      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
        cancel() {
          fileStream.destroy();
        },
      });

      return new NextResponse(webStream as any, {
        status: 200,
        headers: {
          "Content-Length": String(fileSize),
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Content-Disposition": `attachment; filename="${cleanFilename}"`,
        },
      });
    }
  }

  return new NextResponse("Original file not found in storage", { status: 404 });
}
