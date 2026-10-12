// Download token management and live-piped download engine conforming to CONTRACT §4.2, §7, §9 & CHUNKS B6

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { downloadGrants, shareLinks, projects, auditLog } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { env } from "@/lib/env";

export interface CreateDownloadTokenResult {
  token: string;
  expiresAt: string;
}

/**
 * Generates a signed, 5-minute single-use download token and records it in download_grants.
 */
export async function createDownloadToken(
  linkId: string,
  kind: "original" | "preview" = "original",
  ttlMinutes = 5
): Promise<CreateDownloadTokenResult> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
  const payload = `${linkId}|${rawToken}|${exp}`;
  const sig = crypto
    .createHmac("sha256", env.DOWNLOAD_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");

  const token = `${rawToken}.${exp}.${sig}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(exp * 1000);

  // Store grant in database
  await db.insert(downloadGrants).values({
    linkId,
    tokenHash,
    expiresAt,
    usedAt: null,
    kind,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Validates and consumes a single-use download token (CONTRACT §6 & B6).
 * Rejects expired tokens and previously consumed tokens.
 */
export async function validateAndConsumeDownloadToken(
  token: string,
  linkId: string
): Promise<{
  valid: boolean;
  error?: "INVALID_TOKEN" | "TOKEN_EXPIRED" | "TOKEN_ALREADY_USED";
  grantId?: string;
}> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "INVALID_TOKEN" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "INVALID_TOKEN" };
  }

  const [rawToken, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return { valid: false, error: "TOKEN_EXPIRED" };
  }

  // Verify HMAC signature
  const payload = `${linkId}|${rawToken}|${exp}`;
  const expectedSig = crypto
    .createHmac("sha256", env.DOWNLOAD_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");

  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expectedSig);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "INVALID_TOKEN" };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Lookup in database
  const [grant] = await db
    .select()
    .from(downloadGrants)
    .where(
      and(
        eq(downloadGrants.tokenHash, tokenHash),
        eq(downloadGrants.linkId, linkId)
      )
    )
    .limit(1);

  if (!grant) {
    return { valid: false, error: "INVALID_TOKEN" };
  }

  if (new Date(grant.expiresAt).getTime() <= Date.now()) {
    return { valid: false, error: "TOKEN_EXPIRED" };
  }

  if (grant.usedAt !== null) {
    return { valid: false, error: "TOKEN_ALREADY_USED" };
  }

  // Atomically mark token as used
  const [updated] = await db
    .update(downloadGrants)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(downloadGrants.id, grant.id),
        sql`${downloadGrants.usedAt} IS NULL`
      )
    )
    .returning();

  if (!updated) {
    return { valid: false, error: "TOKEN_ALREADY_USED" };
  }

  return { valid: true, grantId: grant.id };
}
