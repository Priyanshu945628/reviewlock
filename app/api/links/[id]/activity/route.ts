// GET /api/links/:id/activity conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { getShareLinkActivity } from "@/lib/links/service";

export async function GET(
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
    const activity = await getShareLinkActivity(linkId, session.user.id);
    return NextResponse.json({
      ok: true,
      data: activity,
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
        error: { code: "SERVER_ERROR", message: error?.message || "Failed to load link activity" },
      },
      { status: 500 }
    );
  }
}
