// GET /api/v/:slug conforming to CONTRACT §9 & DESIGN §6.9
// Returns public link metadata and state. Never leaks private editor details or Drive information.

import { NextRequest, NextResponse } from "next/server";
import { getPublicLinkMeta } from "@/lib/viewer/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const meta = await getPublicLinkMeta(slug);
    if (!meta) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Link not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: meta,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: "Failed to load link" },
      },
      { status: 500 }
    );
  }
}
