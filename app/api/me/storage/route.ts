// GET /api/me/storage conforming to CONTRACT §4.0 and §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie(req);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  // Dynamically compute exact total storage used by this specific user's projects
  const [result] = await db
    .select({
      totalBytes: sql<string>`COALESCE(SUM(${projects.originalSize}), 0)`,
    })
    .from(projects)
    .where(eq(projects.userId, session.user.id));

  const usedBytes = parseInt(result?.totalBytes || "0", 10) || 0;

  // Sync users table in database
  await db
    .update(users)
    .set({ storageUsedBytes: usedBytes })
    .where(eq(users.id, session.user.id))
    .catch(() => {});

  const limitBytes = env.MAX_STORAGE_PER_USER_GB * 1024 * 1024 * 1024;

  return NextResponse.json({
    ok: true,
    data: {
      usedBytes,
      limitBytes,
    },
  });
}
