import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/auth/constants";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedApi =
    pathname.startsWith("/api/projects") ||
    pathname.startsWith("/api/me") ||
    pathname.startsWith("/api/uploads");

  const isProtectedPage =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/settings");

  if (!isProtectedApi && !isProtectedPage) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    if (isProtectedApi) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access this resource.",
          },
        },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/projects/:path*",
    "/settings/:path*",
    "/api/projects/:path*",
    "/api/me/:path*",
    "/api/uploads/:path*",
  ],
};
