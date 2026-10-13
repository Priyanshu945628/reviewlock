// POST /api/uploads conforming to CONTRACT §5 and §9

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { checkStorageLimits } from "@/lib/storage/quota";
import { db, ensureDbReady } from "@/lib/db";
import { projects, uploadSessions } from "@/lib/db/schema";
import { getUploadSessionDir } from "@/lib/storage/paths";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".mxf",
]);

const uploadInitSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  size: z.number().int().positive("File size must be positive"),
  mimeType: z.string().optional(),
  title: z.string().optional(),
  chunkSize: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await ensureDbReady();

    const session = await getSessionFromCookie(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_BODY", message: "Malformed JSON body" } },
        { status: 400 }
      );
    }

    const parseResult = uploadInitSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parseResult.error.errors[0]?.message || "Invalid input",
          },
        },
        { status: 400 }
      );
    }

    const { filename, size, title } = parseResult.data;

    // 1. Verify extension
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_FILE_TYPE",
            message: `File format '${ext || "unknown"}' is not allowed. Only MP4, MOV, MKV, WEBM, and MXF files are supported.`,
          },
        },
        { status: 400 }
      );
    }

    // 2. Storage quota & disk space checks (CONTRACT §4.0 & §5)
    const quotaCheck = await checkStorageLimits(session.user.id, size);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: quotaCheck.code || "STORAGE_QUOTA_EXCEEDED",
            message: quotaCheck.message || "Storage quota exceeded",
          },
        },
        { status: 403 }
      );
    }

    const chunkSize = parseResult.data.chunkSize || 8 * 1024 * 1024; // 8 MiB default (CONTRACT §5)
    const projectTitle =
      title?.trim() || path.basename(filename, ext).replace(/[_-]+/g, " ");

    // 3. Create Project record
    const [newProject] = await db
      .insert(projects)
      .values({
        userId: session.user.id,
        title: projectTitle,
        status: "uploading",
        originalFilename: filename,
        originalSize: size,
      })
      .returning();

    // 4. Create Upload Session record
    const [newUploadSession] = await db
      .insert(uploadSessions)
      .values({
        projectId: newProject.id,
        totalSize: size,
        chunkSize,
        receivedChunksJson: [],
        status: "active",
      })
      .returning();

    // 5. Ensure writable temp directory for session chunks
    await getUploadSessionDir(newUploadSession.id);

    return NextResponse.json({
      ok: true,
      data: {
        uploadId: newUploadSession.id,
        projectId: newProject.id,
        chunkSize,
      },
    });
  } catch (err: any) {
    console.error("[Upload] Error initiating upload session:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPLOAD_INIT_ERROR",
          message: err?.message
            ? `Failed to initialize upload: ${err.message}`
            : "Failed to initialize upload session",
        },
      },
      { status: 500 }
    );
  }
}
