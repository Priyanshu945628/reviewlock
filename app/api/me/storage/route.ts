// GET /api/me/storage conforming to CONTRACT §4.0 and §9

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
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

  const limitBytes = env.MAX_STORAGE_PER_USER_GB * 1024 * 1024 * 1024;

  return NextResponse.json({
    ok: true,
    data: {
      usedBytes: session.user.storageUsedBytes,
      limitBytes,
    },
  });
}
