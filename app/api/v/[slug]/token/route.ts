// POST /api/v/:slug/token conforming to CONTRACT §6 & §9
// Refreshes stream token every 40s for active player playback

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks, viewerSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  VIEWER_COOKIE_NAME,
  generateStreamToken,
} from "@/lib/viewer/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Identify session
  const cookieSessionId = req.cookies.get(VIEWER_COOKIE_NAME)?.value;
  let bodySessionId: string | undefined;
  try {
    const body = await req.json();
    bodySessionId = body.sessionId;
  } catch {}

  const sessionId = cookieSessionId || bodySessionId;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Viewer session not found" } },
      { status: 401 }
    );
  }

  // 2. Fetch link
  const [link] = await db
    .select({
      id: shareLinks.id,
      slug: shareLinks.slug,
      status: shareLinks.status,
      expiresAt: shareLinks.expiresAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Link not found" } },
      { status: 404 }
    );
  }

  // 3. Status checks: if revoked mid-playback, stop refresh immediately
  if (link.status === "revoked") {
    return NextResponse.json(
      { ok: false, error: { code: "LINK_REVOKED", message: "This link has been revoked" } },
      { status: 403 }
    );
  }

  if (
    link.status !== "unlocked" &&
    link.expiresAt &&
    new Date(link.expiresAt).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { ok: false, error: { code: "LINK_EXPIRED", message: "This link has expired" } },
      { status: 403 }
    );
  }

  // 4. Verify viewer session belongs to this link
  const [session] = await db
    .select()
    .from(viewerSessions)
    .where(
      and(eq(viewerSessions.id, sessionId), eq(viewerSessions.linkId, link.id))
    )
    .limit(1);

  if (!session && link.status !== "unlocked") {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid viewer session" } },
      { status: 401 }
    );
  }

  // 5. Issue refreshed 60s stream token
  const token = generateStreamToken(link.id, sessionId, 60);

  return NextResponse.json({
    ok: true,
    data: {
      streamToken: token,
      expiresIn: 60,
    },
  });
}
