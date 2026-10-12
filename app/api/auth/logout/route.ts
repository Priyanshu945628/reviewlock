import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(
      new RegExp(`(?:^|; )\\s*${SESSION_COOKIE_NAME}=([^;]*)`)
    );
    const token = match ? decodeURIComponent(match[1]) : null;

    if (token) {
      await invalidateSession(token);
    }

    const response = NextResponse.json({
      ok: true,
      data: null,
    });

    clearSessionCookie(response);
    return response;
  } catch (err: any) {
    console.error("[Auth] Logout route error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVER_ERROR",
          message: "An unexpected error occurred during logout.",
        },
      },
      { status: 500 }
    );
  }
}
