// GET /api/v/:slug/seg/:file conforming to CONTRACT §6 & §9
// Verifies stream token, session binding, and live link status on EVERY segment request

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import { db } from "@/lib/db";
import { shareLinks, viewerSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  verifyStreamToken,
  getSegmentPath,
} from "@/lib/viewer/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; file: string }> }
) {
  const { slug, file } = await params;
  const token = req.nextUrl.searchParams.get("t");

  if (!token) {
    return new NextResponse("Stream token required", { status: 403 });
  }

  // 1. Fetch link
  const [link] = await db
    .select({
      id: shareLinks.id,
      slug: shareLinks.slug,
      projectId: shareLinks.projectId,
      status: shareLinks.status,
    })
    .from(shareLinks)
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return new NextResponse("Link not found", { status: 404 });
  }

  // 2. LIVE STATUS CHECK (CONTRACT §6: Revocation mid-playback stops segments immediately)
  if (link.status === "revoked") {
    return new NextResponse("Link revoked", { status: 403 });
  }

  // 3. Verify stream token binding
  const verification = verifyStreamToken(token, link.id);
  if (!verification.valid || !verification.sessionId) {
    return new NextResponse(
      verification.error === "EXPIRED" ? "Stream token expired" : "Invalid stream token",
      { status: 403 }
    );
  }

  // 4. Verify viewer session is still active (unless link is unlocked)
  if (link.status !== "unlocked") {
    const [session] = await db
      .select({ id: viewerSessions.id })
      .from(viewerSessions)
      .where(
        and(
          eq(viewerSessions.id, verification.sessionId),
          eq(viewerSessions.linkId, link.id)
        )
      )
      .limit(1);

    if (!session) {
      return new NextResponse("Viewer session invalid", { status: 403 });
    }
  }

  // 5. Resolve segment file path safely
  const segmentPath = await getSegmentPath({
    projectId: link.projectId,
    segmentFilename: file,
  });

  if (!segmentPath || !fs.existsSync(segmentPath)) {
    return new NextResponse("Segment file not found", { status: 404 });
  }

  // 6. Stream binary MPEG-TS segment
  const stat = fs.statSync(segmentPath);
  const fileStream = fs.createReadStream(segmentPath);

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
      "Content-Type": "video/mp2t",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, no-cache, no-store",
    },
  });
}
