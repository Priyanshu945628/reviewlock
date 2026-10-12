import { NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSessionUserFromRequest(req);

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access editor session.",
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        user: session.user,
      },
    });
  } catch (err: any) {
    console.error("[Auth] Me route error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVER_ERROR",
          message: "An unexpected error occurred while fetching user profile.",
        },
      },
      { status: 500 }
    );
  }
}
