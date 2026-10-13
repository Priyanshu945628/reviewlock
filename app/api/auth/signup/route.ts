import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
    const rateLimit = checkRateLimit(`signup:${ip}`, 10, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: `Too many signup attempts. Try again in ${rateLimit.resetInSeconds} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);
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

    const { email, password, displayName } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already registered
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "EMAIL_EXISTS",
            message: "An account with this email address already exists.",
          },
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        displayName: displayName.trim(),
        storageUsedBytes: 0,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        storageUsedBytes: users.storageUsedBytes,
        createdAt: users.createdAt,
      });

    const { token, expiresAt } = await createSession(newUser.id);

    const response = NextResponse.json({
      ok: true,
      data: {
        user: newUser,
      },
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (err: any) {
    console.error("[Auth] Signup route error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVER_ERROR",
          message: "An error occurred while creating your account.",
        },
      },
      { status: 500 }
    );
  }
}
