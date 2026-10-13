// GET /api/activity conforming to CONTRACT §9 & CHUNKS F7+B8
// Returns workspace audit log activity for the authenticated editor

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, projects, shareLinks } from "@/lib/db/schema";
import { eq, desc, inArray, or } from "drizzle-orm";
import { getSessionFromCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  // 1. Find all project IDs owned by this editor
  const userProjects = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.userId, userId));

  const projectIds = userProjects.map((p: any) => p.id);
  const projectTitleMap = new Map(userProjects.map((p: any) => [p.id, p.title]));

  // 2. Find all link IDs for these projects
  let linkIds: string[] = [];
  const linkLabelMap = new Map<string, string>();

  if (projectIds.length > 0) {
    const userLinks = await db
      .select({
        id: shareLinks.id,
        clientLabel: shareLinks.clientLabel,
        projectId: shareLinks.projectId,
      })
      .from(shareLinks)
      .where(inArray(shareLinks.projectId, projectIds));

    linkIds = userLinks.map((l: any) => l.id);
    for (const l of userLinks) {
      linkLabelMap.set(l.id, l.clientLabel || "Client");
    }
  }

  // 3. Query audit log
  const conditions = [eq(auditLog.actorId, userId)];
  if (projectIds.length > 0) {
    conditions.push(inArray(auditLog.entityId, projectIds));
  }
  if (linkIds.length > 0) {
    conditions.push(inArray(auditLog.entityId, linkIds));
  }

  const logs = await db
    .select()
    .from(auditLog)
    .where(or(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  // 4. Format into user-friendly timeline items
  const activities = logs.map((entry: any) => {
    let title = "System Event";
    let detail = `Action ${entry.action} on ${entry.entity}`;

    switch (entry.action) {
      case "project_created":
        title = "Project Uploaded";
        detail = `Created project: ${projectTitleMap.get(entry.entityId) || "Video Project"}`;
        break;
      case "link_created":
        title = "Share Link Created";
        detail = `Created share link for "${linkLabelMap.get(entry.entityId) || "Client"}"`;
        break;
      case "link_unlocked":
        title = "Original Released";
        detail = `Full-quality video released for "${linkLabelMap.get(entry.entityId) || "Client"}"`;
        break;
      case "link_revoked":
        title = "Link Revoked";
        detail = `Revoked access to share link for "${linkLabelMap.get(entry.entityId) || "Client"}"`;
        break;
      case "viewer_opened":
        title = "Client Opened Preview";
        detail = `Client connected and claimed a viewing slot.`;
        break;
      case "original_downloaded":
        title = "Original Downloaded";
        detail = `Master video was live-streamed to client.`;
        break;
      case "rendition_ready":
        title = "Processing Complete";
        detail = `Watermarked preview and timeline thumbnails generated.`;
        break;
    }

    return {
      id: entry.id,
      title,
      detail,
      action: entry.action,
      entity: entry.entity,
      timestamp: entry.createdAt.toISOString(),
      status: "completed",
    };
  });

  return NextResponse.json({
    ok: true,
    data: { activities },
  });
}
