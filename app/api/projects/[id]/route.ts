// GET, PATCH, DELETE /api/projects/:id conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, renditions, users, auditLog } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getStorageProvider } from "@/lib/storage";

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

  const projectRenditions = await db
    .select()
    .from(renditions)
    .where(eq(renditions.projectId, projectId));

  return NextResponse.json({
    ok: true,
    data: {
      project,
      renditions: projectRenditions,
    },
  });
}

export async function PATCH(
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Malformed JSON body" } },
      { status: 400 }
    );
  }

  const title = body?.title?.trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_TITLE", message: "Title cannot be empty" } },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(projects)
    .set({ title })
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Project not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { project: updated },
  });
}

export async function DELETE(
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

  // 1. Delete original from Google Drive if uploaded (CONTRACT §5)
  if (project.driveFileId) {
    try {
      const storage = getStorageProvider();
      await storage.deleteOriginal(project.driveFileId);
    } catch (err: any) {
      console.warn(`[DeleteProject] Failed to delete Drive file ${project.driveFileId}:`, err.message);
    }
  }

  // 2. Decrement user's storage quota (CONTRACT §5)
  if (project.status === "ready") {
    await db
      .update(users)
      .set({
        storageUsedBytes: sql`GREATEST(0, ${users.storageUsedBytes} - ${project.originalSize})`,
      })
      .where(eq(users.id, session.user.id));
  }

  // 3. Delete project from DB (cascades to renditions, links, upload_sessions)
  await db.delete(projects).where(eq(projects.id, projectId));

  // 4. Log audit event
  await db.insert(auditLog).values({
    actorType: "editor",
    actorId: session.user.id,
    entity: "project",
    entityId: projectId,
    action: "project_deleted",
    metaJson: {
      originalSize: project.originalSize,
      driveFileId: project.driveFileId,
    },
  });

  return NextResponse.json({
    ok: true,
    data: { deleted: true },
  });
}
