// GET /api/v/:slug/playlist.m3u8 conforming to CONTRACT §6 & §9
// Rewrites segment URLs with authenticated stream tokens; Cache-Control: private, no-store

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyStreamToken,
  getRewrittenPlaylist,
} from "@/lib/viewer/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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

  if (link.status === "revoked") {
    return new NextResponse("Link revoked", { status: 403 });
  }

  // 2. Verify stream token binding
  const verification = verifyStreamToken(token, link.id);
  if (!verification.valid) {
    return new NextResponse(
      verification.error === "EXPIRED" ? "Stream token expired" : "Invalid stream token",
      { status: 403 }
    );
  }

  // 3. Rewrite playlist with active token
  const playlist = await getRewrittenPlaylist({
    slug: link.slug,
    linkId: link.id,
    projectId: link.projectId,
    streamToken: token,
  });

  if (!playlist) {
    return new NextResponse("Preview playlist not ready", { status: 404 });
  }

  return new NextResponse(playlist, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "private, no-store, must-revalidate",
    },
  });
}
