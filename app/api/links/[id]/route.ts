// PATCH /api/links/:id conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { updateShareLink } from "@/lib/links/service";

export async function PATCH(
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const updated = await updateShareLink(linkId, session.user.id, {
      clientLabel: body.clientLabel,
      visibility: body.visibility,
      passcode: body.passcode,
      previewMode: body.previewMode,
      previewStart: body.previewStart !== undefined ? Number(body.previewStart) : undefined,
      previewEnd: body.previewEnd !== undefined ? Number(body.previewEnd) : undefined,
      maxViewers: body.maxViewers !== undefined ? Number(body.maxViewers) : undefined,
      allowPreviewDownload: body.allowPreviewDownload,
      watermarkText: body.watermarkText,
      expiresAt: body.expiresAt,
    });

    return NextResponse.json({
      ok: true,
      data: { link: updated },
    });
  } catch (error: any) {
    if (error.message === "LINK_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Share link not found" } },
        { status: 404 }
      );
    }
    if (error.message === "CANNOT_MODIFY_REVOKED_LINK") {
      return NextResponse.json(
        { ok: false, error: { code: "LINK_REVOKED", message: "Cannot edit a revoked share link" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: error?.message || "Failed to update share link" },
      },
      { status: 500 }
    );
  }
}
