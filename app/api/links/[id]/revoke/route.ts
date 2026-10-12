// POST /api/links/:id/revoke conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { revokeShareLink } from "@/lib/links/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: linkId } = await params;
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  try {
    const revoked = await revokeShareLink(linkId, session.user.id);
    return NextResponse.json({
      ok: true,
      data: { link: revoked, revoked: true },
    });
  } catch (error: any) {
    if (error.message === "LINK_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Share link not found" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: error?.message || "Failed to revoke share link" },
      },
      { status: 500 }
    );
  }
}
