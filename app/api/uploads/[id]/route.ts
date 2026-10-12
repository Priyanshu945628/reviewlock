// GET /api/uploads/:id conforming to CONTRACT §5 and §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { uploadSessions, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
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

  const [sessionRecord] = await db
    .select({
      uploadId: uploadSessions.id,
      projectId: uploadSessions.projectId,
      totalSize: uploadSessions.totalSize,
      chunkSize: uploadSessions.chunkSize,
      receivedChunksJson: uploadSessions.receivedChunksJson,
      status: uploadSessions.status,
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

  const receivedChunks: number[] = Array.isArray(
    sessionRecord.receivedChunksJson
  )
    ? (sessionRecord.receivedChunksJson as number[])
    : [];

  return NextResponse.json({
    ok: true,
    data: {
      uploadId: sessionRecord.uploadId,
      projectId: sessionRecord.projectId,
      totalSize: sessionRecord.totalSize,
      chunkSize: sessionRecord.chunkSize,
      receivedChunks,
      status: sessionRecord.status,
    },
  });
}
