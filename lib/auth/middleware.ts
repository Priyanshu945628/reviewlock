import { NextResponse } from "next/server";
import { getSessionUserFromRequest, SessionUser } from "./session";

export type AuthenticatedRouteHandler = (
  req: Request,
  user: SessionUser
) => Promise<Response>;

/**
 * Higher-order wrapper to protect API route handlers with editor session validation.
 */
export function withAuth(handler: AuthenticatedRouteHandler) {
  return async (req: Request) => {
    const session = await getSessionUserFromRequest(req);

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to perform this action.",
          },
        },
        { status: 401 }
      );
    }

    return handler(req, session.user);
  };
}
