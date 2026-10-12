// GET, PATCH, DELETE /api/projects/:id conforming to CONTRACT §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, renditions, users, auditLog, shareLinks } from "@/lib/db/schema";
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

  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.projectId, projectId));

  const linkCount = links.length;
  const viewedCount = links.reduce((acc, l) => acc + (l.viewersUsed || 0), 0);
  const latestLink = links.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  let lastViewedRelative = "Never";
  if (latestLink && viewedCount > 0) {
    lastViewedRelative = latestLink.createdAt.toISOString();
  } else if (linkCount > 0) {
    lastViewedRelative = "Created " + latestLink.createdAt.toISOString();
  }

  let statusLabel = "Ready";
  if (project.status === "uploading" || project.status === "processing") {
    statusLabel = "Processing";
  } else if (project.status === "failed") {
    statusLabel = "Failed";
  } else if (links.some((l) => l.status === "unlocked")) {
    statusLabel = "Paid";
  } else if (links.some((l) => l.status === "viewers_exhausted")) {
    statusLabel = "Awaiting payment";
  }

  return NextResponse.json({
    ok: true,
    data: {
      project: {
        ...project,
        createdAt: project.createdAt.toISOString(),
        durationSeconds: project.durationSeconds || 0,
        width: project.width || 1920,
        height: project.height || 1080,
        linkCount,
        viewedCount,
        lastViewedRelative,
        statusLabel,
      },
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
