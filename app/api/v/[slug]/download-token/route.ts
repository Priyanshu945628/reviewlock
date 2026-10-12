// POST /api/v/:slug/download-token conforming to CONTRACT §9 & CHUNKS B6
// Generates a 5-minute single-use download token for unlocked links

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createDownloadToken } from "@/lib/download/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Fetch link
  const [link] = await db
    .select({
      id: shareLinks.id,
      status: shareLinks.status,
    })
    .from(shareLinks)
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Link not found" } },
      { status: 404 }
    );
  }

  // 2. Only unlocked links can issue full download tokens (CONTRACT §6 & §9)
  if (link.status !== "unlocked") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "LINK_NOT_UNLOCKED",
          message: "Full video download has not been released yet",
        },
      },
      { status: 403 }
    );
  }

  // 3. Issue 5-minute single-use download token
  const grant = await createDownloadToken(link.id, "original", 5);

  return NextResponse.json({
    ok: true,
    data: {
      downloadToken: grant.token,
      expiresAt: grant.expiresAt,
    },
  });
}
