// PUT /api/uploads/:id/chunk?index=n conforming to CONTRACT §5 and §9

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { uploadSessions, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";

const uploadLocks = new Map<string, Promise<any>>();

async function withUploadLock<T>(
  uploadId: string,
  fn: () => Promise<T>
): Promise<T> {
  const current = uploadLocks.get(uploadId) || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  uploadLocks.set(uploadId, current.then(() => next));

  try {
    await current;
    return await fn();
  } finally {
    release!();
    if (uploadLocks.get(uploadId) === next) {
      uploadLocks.delete(uploadId);
    }
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: uploadId } = await params;
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const indexStr = req.nextUrl.searchParams.get("index");
  if (indexStr === null) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MISSING_CHUNK_INDEX",
          message: "Query parameter 'index' is required.",
        },
      },
      { status: 400 }
    );
  }

  const chunkIndex = parseInt(indexStr, 10);
  if (isNaN(chunkIndex) || chunkIndex < 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_CHUNK_INDEX",
          message: "Chunk index must be a non-negative integer.",
        },
      },
      { status: 400 }
    );
  }

  // 1. Fetch upload session and verify project ownership
  const [sessionRecord] = await db
    .select({
      uploadId: uploadSessions.id,
      status: uploadSessions.status,
      chunkSize: uploadSessions.chunkSize,
      totalSize: uploadSessions.totalSize,
      receivedChunksJson: uploadSessions.receivedChunksJson,
      userId: projects.userId,
    })
    .from(uploadSessions)
    .innerJoin(projects, eq(uploadSessions.projectId, projects.id))
    .where(eq(uploadSessions.id, uploadId))
    .limit(1);

  if (!sessionRecord) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "Upload session not found." },
      },
      { status: 404 }
    );
  }

  if (sessionRecord.userId !== session.user.id) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "FORBIDDEN", message: "Access denied to this upload session." },
      },
      { status: 403 }
    );
  }

  if (sessionRecord.status !== "active") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPLOAD_NOT_ACTIVE",
          message: `Upload session is already ${sessionRecord.status}.`,
        },
      },
      { status: 400 }
    );
  }

  // 2. Read chunk binary data
  const chunkBuffer = Buffer.from(await req.arrayBuffer());
  if (chunkBuffer.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "EMPTY_CHUNK", message: "Received empty chunk payload." },
      },
      { status: 400 }
    );
  }

  // 3. Write chunk file to disk
  const uploadDir = path.join(env.DATA_DIR, "uploads", uploadId);
  await fs.mkdir(uploadDir, { recursive: true });
  const chunkFilePath = path.join(uploadDir, `chunk_${chunkIndex}.part`);

  await fs.writeFile(chunkFilePath, chunkBuffer);

  // Keyed lock to prevent race condition during concurrent chunk registration
  const updatedChunks = await withUploadLock(uploadId, async () => {
    const [freshRecord] = await db
      .select({ receivedChunksJson: uploadSessions.receivedChunksJson })
      .from(uploadSessions)
      .where(eq(uploadSessions.id, uploadId))
      .limit(1);

    const existing: number[] = Array.isArray(freshRecord?.receivedChunksJson)
      ? (freshRecord.receivedChunksJson as number[])
      : [];

    const set = new Set(existing);
    set.add(chunkIndex);
    const sorted = Array.from(set).sort((a, b) => a - b);

    await db
      .update(uploadSessions)
      .set({ receivedChunksJson: sorted })
      .where(eq(uploadSessions.id, uploadId));

    return sorted;
  });

  return NextResponse.json({
    ok: true,
    data: {
      receivedChunk: chunkIndex,
      totalChunksReceived: updatedChunks.length,
    },
  });
}
