// GET /api/projects: list user's projects with query params (search, status, limit, offset)
// Conforming to CONTRACT §9 & DESIGN §6.3

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, shareLinks } from "@/lib/db/schema";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { formatRelative } from "@/lib/format";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const conditions = [eq(projects.userId, session.user.id)];

  if (search && search.trim().length > 0) {
    conditions.push(ilike(projects.title, `%${search.trim()}%`));
  }

  if (status && status !== "all") {
    // Map status filter
    if (status === "processing" || status === "ready" || status === "failed") {
      conditions.push(eq(projects.status, status));
    }
  }

  const userProjects = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);

  // Aggregate link info for each project
  const projectListWithMeta = await Promise.all(
    userProjects.map(async (p) => {
      const links = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.projectId, p.id));

      const linkCount = links.length;
      const viewedCount = links.reduce((acc, l) => acc + (l.viewersUsed || 0), 0);

      // Find the most recent link created or updated
      const latestLink = links.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      let lastViewedRelative = "Never";
      if (latestLink && viewedCount > 0) {
        lastViewedRelative = formatRelative(latestLink.createdAt);
      } else if (linkCount > 0) {
        lastViewedRelative = "Created " + formatRelative(latestLink.createdAt);
      }

      let statusLabel = "Ready";
      if (p.status === "uploading" || p.status === "processing") {
        statusLabel = "Processing";
      } else if (p.status === "failed") {
        statusLabel = "Failed";
      } else if (links.some((l) => l.status === "unlocked")) {
        statusLabel = "Paid";
      } else if (links.some((l) => l.status === "viewers_exhausted")) {
        statusLabel = "Awaiting payment";
      }

      return {
        id: p.id,
        userId: p.userId,
        title: p.title,
        status: p.status === "ready" ? "ready" : p.status === "failed" ? "failed" : "processing",
        originalFilename: p.originalFilename,
        originalSize: p.originalSize,
        durationSeconds: p.durationSeconds || 0,
        width: p.width || 1920,
        height: p.height || 1080,
        driveFileId: p.driveFileId,
        driveMd5: p.driveMd5,
        createdAt: p.createdAt.toISOString(),
        linkCount,
        viewedCount,
        lastViewedRelative,
        statusLabel,
      };
    })
  );

  return NextResponse.json({
    ok: true,
    data: {
      projects: projectListWithMeta,
    },
  });
}
