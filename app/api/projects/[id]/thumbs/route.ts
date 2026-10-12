// GET /api/projects/:id/thumbs conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, renditions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";

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

  const [project] = await db
    .select({ id: projects.id, duration: projects.durationSeconds })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Project not found" } },
      { status: 404 }
    );
  }

  const thumbsDir = path.join(env.DATA_DIR, "thumbs", projectId);
  const spritePath = path.join(thumbsDir, "sprite.jpg");
  const vttPath = path.join(thumbsDir, "thumbs.vtt");

  const isImageRequest = req.nextUrl.searchParams.get("image") === "true";
  const isVttRequest = req.nextUrl.searchParams.get("vtt") === "true";

  // 1. Serve Sprite Image
  if (isImageRequest) {
    try {
      const imageBuffer = await fs.readFile(spritePath);
      return new NextResponse(imageBuffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Sprite not generated yet" } },
        { status: 404 }
      );
    }
  }

  // 2. Serve VTT File
  if (isVttRequest) {
    try {
      const vttContent = await fs.readFile(vttPath, "utf-8");
      return new NextResponse(vttContent, {
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "VTT not generated yet" } },
        { status: 404 }
      );
    }
  }

  // 3. Return JSON Metadata
  return NextResponse.json({
    ok: true,
    data: {
      spriteUrl: `/api/projects/${projectId}/thumbs?image=true`,
      vttUrl: `/api/projects/${projectId}/thumbs?vtt=true`,
      frameCount: 10,
      thumbWidth: 160,
      thumbHeight: 90,
      duration: project.duration,
    },
  });
}
