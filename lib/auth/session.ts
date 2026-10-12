import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "./constants";

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  storageUsedBytes: number;
  createdAt: Date;
}

export interface ValidatedSession {
  user: SessionUser;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates and persists a new database session for an editor user.
 */
export async function createSession(
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Validates a session token against the database, ensuring it has not expired.
 */
export async function validateSessionToken(
  token: string
): Promise<ValidatedSession | null> {
  if (!token) return null;

  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      storageUsedBytes: users.storageUsedBytes,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, now)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      storageUsedBytes: row.storageUsedBytes,
      createdAt: row.createdAt,
    },
  };
}

/**
 * Invalidates and deletes a session from the database.
 */
export async function invalidateSession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, token));
}

/**
 * Sets the httpOnly secure sameSite=lax session cookie on a response.
 */
export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Clears the session cookie.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Extracts and validates the session from an incoming Request.
 */
export async function getSessionUserFromRequest(
  req: Request
): Promise<ValidatedSession | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )\\s*${SESSION_COOKIE_NAME}=([^;]*)`)
  );
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token) return null;
  return validateSessionToken(token);
}

export const getSessionFromCookie = getSessionUserFromRequest;
