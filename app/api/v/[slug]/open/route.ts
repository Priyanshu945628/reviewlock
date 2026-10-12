// POST /api/v/:slug/open conforming to CONTRACT §6 & §9
// Validates passcode (with rate limiting / lockout), executes atomic slot claim, sets httpOnly cookie, issues stream token

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { shareLinks, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  VIEWER_COOKIE_NAME,
  claimViewerSlot,
  generateStreamToken,
  hashClientIdentifiers,
  verifyLinkPasscode,
} from "@/lib/viewer/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Identify client IP and User Agent
  const forwarded = req.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";
  const { ipHash, uaHash } = hashClientIdentifiers(clientIp, userAgent);

  // 2. Fetch link
  const [link] = await db
    .select({
      id: shareLinks.id,
      slug: shareLinks.slug,
      status: shareLinks.status,
      visibility: shareLinks.visibility,
      passcodeHash: shareLinks.passcodeHash,
      previewStart: shareLinks.previewStart,
      previewEnd: shareLinks.previewEnd,
      maxViewers: shareLinks.maxViewers,
      viewersUsed: shareLinks.viewersUsed,
      expiresAt: shareLinks.expiresAt,
      projectId: shareLinks.projectId,
      projectStatus: projects.status,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Share link not found" } },
      { status: 404 }
    );
  }

  if (link.status === "revoked") {
    return NextResponse.json(
      { ok: false, error: { code: "LINK_REVOKED", message: "This link is no longer available" } },
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

  // 3. Parse request body for passcode
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // 4. Verify passcode if private (CONTRACT §6)
  if (link.visibility === "private" && link.passcodeHash) {
    const passcode = body.passcode;
    if (!passcode) {
      return NextResponse.json(
        { ok: false, error: { code: "PASSCODE_REQUIRED", message: "Passcode required to open this video" } },
        { status: 401 }
      );
    }

    const verification = await verifyLinkPasscode(link.id, passcode, clientIp);
    if (!verification.ok) {
      if (verification.error === "RATE_LIMITED") {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: `Too many attempts. Try again in ${Math.ceil((verification.retryAfterSeconds || 60) / 60)} minutes.`,
            },
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "PASSCODE_WRONG", message: "That passcode isn't right." } },
        { status: 401 }
      );
    }
  }

  // 5. Existing or new viewer session ID from cookie
  const existingCookie = req.cookies.get(VIEWER_COOKIE_NAME)?.value;
  const sessionId = existingCookie && existingCookie.length > 10 ? existingCookie : crypto.randomUUID();

  // 6. Claim viewer slot (atomic update) (CONTRACT §6)
  const claimResult = await claimViewerSlot({
    linkId: link.id,
    sessionId,
    ipHash,
    uaHash,
  });

  if (!claimResult.ok) {
    const errCode = claimResult.error || "ACCESS_DENIED";
    let message = "Unable to access preview";
    if (errCode === "VIEWERS_EXHAUSTED") message = "This link has reached its viewer limit";
    if (errCode === "LINK_EXPIRED") message = "This link has expired";
    if (errCode === "LINK_REVOKED") message = "This link is no longer available";

    return NextResponse.json(
      { ok: false, error: { code: errCode, message } },
      { status: 403 }
    );
  }

  // 7. Issue initial stream token (60s TTL)
  const streamToken = generateStreamToken(link.id, sessionId, 60);

  // 8. Construct response and set httpOnly cookie (CONTRACT §6)
  const response = NextResponse.json({
    ok: true,
    data: {
      streamToken,
      sessionId,
      previewStart: link.previewStart,
      previewEnd: link.previewEnd || 30,
      playlistUrl: `/api/v/${link.slug}/playlist.m3u8?t=${encodeURIComponent(streamToken)}`,
    },
  });

  response.cookies.set(VIEWER_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return response;
}
