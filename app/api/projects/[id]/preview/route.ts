// GET /api/projects/:id/preview
// Streams the watermarked MP4 preview for the project owner with HTTP Range support
// Falls back to streaming the assembled original if the preview is still being prepared

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, renditions, uploadSessions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getWritableBaseDir } from "@/lib/storage/paths";
import { env } from "@/lib/env";
import * as fs from "fs";
import * as path from "path";
import os from "os";

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
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Project not found" } },
      { status: 404 }
    );
  }

  // 1. Check renditions table for ready preview_mp4
  let targetVideoPath: string | null = null;

  const [mp4Rendition] = await db
    .select()
    .from(renditions)
    .where(
      and(
        eq(renditions.projectId, projectId),
        eq(renditions.type, "preview_mp4")
      )
    )
    .orderBy(desc(renditions.version))
    .limit(1);

  if (mp4Rendition && fs.existsSync(mp4Rendition.localPath)) {
    targetVideoPath = mp4Rendition.localPath;
  }

  // 2. Check candidate directories for preview.mp4
  if (!targetVideoPath) {
    const baseDir = await getWritableBaseDir().catch(() => null);
    const candidateBases = [
      baseDir,
      env.DATA_DIR,
      "/data",
      path.join(process.cwd(), "data"),
      path.join(os.tmpdir(), "reviewlock-data"),
    ].filter(Boolean) as string[];

    for (const base of candidateBases) {
      const candidatePath = path.join(
        base,
        "renditions",
        projectId,
        "v1",
        "preview.mp4"
      );
      if (fs.existsSync(candidatePath)) {
        targetVideoPath = candidatePath;
        break;
      }
    }
  }

  // 3. Fallback: Check if assembled original exists in uploads directory
  if (!targetVideoPath) {
    const [uploadSession] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.projectId, projectId))
      .orderBy(desc(uploadSessions.createdAt))
      .limit(1);

    if (uploadSession) {
      const baseDir = await getWritableBaseDir().catch(() => null);
      const candidateBases = [
        baseDir,
        env.DATA_DIR,
        "/data",
        path.join(process.cwd(), "data"),
        path.join(os.tmpdir(), "reviewlock-data"),
      ].filter(Boolean) as string[];

      for (const base of candidateBases) {
        const candidate1 = path.join(
          base,
          "uploads",
          uploadSession.id,
          "original.mp4"
        );
        const candidate2 = path.join(
          base,
          "uploads",
          uploadSession.id,
          project.originalFilename
        );
        if (fs.existsSync(candidate1)) {
          targetVideoPath = candidate1;
          break;
        }
        if (fs.existsSync(candidate2)) {
          targetVideoPath = candidate2;
          break;
        }
      }
    }
  }

  if (!targetVideoPath || !fs.existsSync(targetVideoPath)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Preview is generating. Please wait...",
        },
      },
      { status: 404 }
    );
  }

  const stat = fs.statSync(targetVideoPath);
  const fileSize = stat.size;
  const range = req.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(targetVideoPath, { start, end });

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
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": "video/mp4",
      },
    });
  } else {
    const fileStream = fs.createReadStream(targetVideoPath);
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
        "Content-Length": String(fileSize),
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      },
    });
  }
}
