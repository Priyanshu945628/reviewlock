import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
    const rateLimit = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000); // 5 attempts per 15 min per CONTRACT §6

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: `Too many login attempts. Please try again in ${rateLimit.resetInSeconds} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Invalid input data",
          },
        },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        storageUsedBytes: users.storageUsedBytes,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
        },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
        },
        { status: 401 }
      );
    }

    // Reset rate limit key on successful login
    resetRateLimit(`login:${ip}`);

    const { token, expiresAt } = await createSession(user.id);

    const response = NextResponse.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          storageUsedBytes: user.storageUsedBytes,
          createdAt: user.createdAt,
        },
      },
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (err: any) {
    console.error("[Auth] Login route error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVER_ERROR",
          message: "An unexpected error occurred during login.",
        },
      },
      { status: 500 }
    );
  }
}
