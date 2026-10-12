// GET /api/v/:slug/preview-download conforming to CONTRACT §9 & DESIGN §6.6
// Downloads watermarked preview MP4 only if allowPreviewDownload is enabled on the link

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { shareLinks, projects, renditions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Fetch link and project
  const [link] = await db
    .select({
      id: shareLinks.id,
      slug: shareLinks.slug,
      status: shareLinks.status,
      allowPreviewDownload: shareLinks.allowPreviewDownload,
      projectId: shareLinks.projectId,
      projectTitle: projects.title,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return new NextResponse("Link not found", { status: 404 });
  }

  if (link.status === "revoked") {
    return new NextResponse("Link revoked", { status: 403 });
  }

  if (!link.allowPreviewDownload) {
    return new NextResponse("Preview download not permitted for this link", {
      status: 403,
    });
  }

  // 2. Fetch latest ready preview MP4 rendition
  const [mp4Rendition] = await db
    .select()
    .from(renditions)
    .where(
      and(
        eq(renditions.projectId, link.projectId),
        eq(renditions.type, "preview_mp4"),
        eq(renditions.status, "ready")
      )
    )
    .orderBy(desc(renditions.version))
    .limit(1);

  if (!mp4Rendition || !fs.existsSync(mp4Rendition.localPath)) {
    return new NextResponse("Preview MP4 not available yet", { status: 404 });
  }

  const stat = fs.statSync(mp4Rendition.localPath);
  const fileStream = fs.createReadStream(mp4Rendition.localPath);
  const cleanTitle = (link.projectTitle || "preview").replace(/[^a-zA-Z0-9_-]/g, "_");

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
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${cleanTitle}_watermarked_preview.mp4"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
