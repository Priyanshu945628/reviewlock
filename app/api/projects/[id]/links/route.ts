// POST & GET /api/projects/:id/links conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import {
  createShareLink,
  getProjectShareLinks,
} from "@/lib/links/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
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
    const link = await createShareLink({
      projectId,
      userId: session.user.id,
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
      data: { link },
    });
  } catch (error: any) {
    if (error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Project not found" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: error?.message || "Failed to create share link" },
      },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  try {
    const links = await getProjectShareLinks(projectId, session.user.id);
    return NextResponse.json({
      ok: true,
      data: { links },
    });
  } catch (error: any) {
    if (error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Project not found" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: error?.message || "Failed to load share links" },
      },
      { status: 500 }
    );
  }
}
