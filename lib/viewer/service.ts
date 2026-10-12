// Viewer Service: Stream tokens, atomic slot claims, session management, and playlist rewriting
// Conforming strictly to CONTRACT §6, §7 & §9 and DESIGN §6.9

import crypto from "node:crypto";
import path from "node:path";
import * as fs from "node:fs";
import { db } from "@/lib/db";
import {
  shareLinks,
  projects,
  renditions,
  viewerSessions,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";

export const VIEWER_COOKIE_NAME = "rl_vs";

export interface StreamTokenPayload {
  linkId: string;
  sessionId: string;
  exp: number;
}

/**
 * Generates an HMAC-SHA256 stream token with 60-second TTL (CONTRACT §6).
 * Format: linkId.sessionId.exp.signature
 */
export function generateStreamToken(
  linkId: string,
  sessionId: string,
  ttlSeconds = 60
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${linkId}|${sessionId}|${exp}`;
  const signature = crypto
    .createHmac("sha256", env.STREAM_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
  return `${linkId}.${sessionId}.${exp}.${signature}`;
}

/**
 * Verifies a stream token's HMAC signature, expiration, and link binding (CONTRACT §6).
 */
export function verifyStreamToken(
  token: string,
  expectedLinkId?: string
): {
  valid: boolean;
  linkId?: string;
  sessionId?: string;
  error?: "EXPIRED" | "INVALID" | "MISMATCH";
} {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "INVALID" };
  }

  const parts = token.split(".");
  if (parts.length !== 4) {
    return { valid: false, error: "INVALID" };
  }

  const [linkId, sessionId, expStr, signature] = parts;

  if (expectedLinkId && linkId !== expectedLinkId) {
    return { valid: false, error: "MISMATCH" };
  }

  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return { valid: false, error: "EXPIRED" };
  }

  const payload = `${linkId}|${sessionId}|${exp}`;
  const expectedSig = crypto
    .createHmac("sha256", env.STREAM_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");

  // Constant-time comparison
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "INVALID" };
  }

  return { valid: true, linkId, sessionId };
}

/**
 * Hash IP address and User Agent for privacy-preserving session identification.
 */
export function hashClientIdentifiers(ip: string, userAgent?: string | null) {
  const ipHash = crypto.createHash("sha256").update(ip || "127.0.0.1").digest("hex");
  const uaHash = crypto
    .createHash("sha256")
    .update(userAgent || "unknown-ua")
    .digest("hex");
  return { ipHash, uaHash };
}

/**
 * Fetches public link metadata.
 * Strips all private information (editor email, Drive file IDs, internal disk paths) (CONTRACT §9).
 */
export async function getPublicLinkMeta(slug: string) {
  const [link] = await db
    .select({
      id: shareLinks.id,
      slug: shareLinks.slug,
      clientLabel: shareLinks.clientLabel,
      visibility: shareLinks.visibility,
      previewMode: shareLinks.previewMode,
      previewStart: shareLinks.previewStart,
      previewEnd: shareLinks.previewEnd,
      maxViewers: shareLinks.maxViewers,
      viewersUsed: shareLinks.viewersUsed,
      allowPreviewDownload: shareLinks.allowPreviewDownload,
      watermarkText: shareLinks.watermarkText,
      expiresAt: shareLinks.expiresAt,
      status: shareLinks.status,
      unlockedAt: shareLinks.unlockedAt,
      projectId: shareLinks.projectId,
      projectTitle: projects.title,
      projectDuration: projects.durationSeconds,
      projectWidth: projects.width,
      projectHeight: projects.height,
      projectStatus: projects.status,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(eq(shareLinks.slug, slug))
    .limit(1);

  if (!link) {
    return null;
  }

  // Check dynamic expiration
  let effectiveStatus = link.status;
  if (
    link.status === "active" &&
    link.expiresAt &&
    new Date(link.expiresAt).getTime() <= Date.now()
  ) {
    effectiveStatus = "expired";
  } else if (link.status === "active" && link.viewersUsed >= link.maxViewers) {
    effectiveStatus = "viewers_exhausted";
  }

  return {
    id: link.id,
    slug: link.slug,
    clientLabel: link.clientLabel,
    isPrivate: link.visibility === "private",
    previewStart: link.previewStart,
    previewEnd: link.previewEnd || 30,
    previewDuration: (link.previewEnd || 30) - link.previewStart,
    allowPreviewDownload: link.allowPreviewDownload,
    watermarkText: link.watermarkText,
    status: effectiveStatus,
    unlockedAt: link.unlockedAt?.toISOString() || null,
    videoTitle: link.projectTitle,
    totalDurationSeconds: link.projectDuration || 0,
    width: link.projectWidth || 1920,
    height: link.projectHeight || 1080,
    isReady: link.projectStatus === "ready",
  };
}

/**
 * Claims a viewer slot using the exact atomic SQL pattern mandated by CONTRACT §6:
 *
 * UPDATE share_links
 *    SET viewers_used = viewers_used + 1
 *  WHERE id = $1 AND status = 'active' AND viewers_used < max_viewers
 *    AND (expires_at IS NULL OR expires_at > now())
 * RETURNING viewers_used;
 */
export async function claimViewerSlot(params: {
  linkId: string;
  sessionId: string;
  ipHash: string;
  uaHash: string;
}) {
  const { linkId, sessionId, ipHash, uaHash } = params;

  // 1. Check if returning viewer session already exists for this link (CONTRACT §6)
  const [existingSession] = await db
    .select()
    .from(viewerSessions)
    .where(
      and(eq(viewerSessions.id, sessionId), eq(viewerSessions.linkId, linkId))
    )
    .limit(1);

  if (existingSession) {
    // Update last_seen timestamp without consuming another viewer slot
    await db
      .update(viewerSessions)
      .set({ lastSeen: new Date() })
      .where(eq(viewerSessions.id, sessionId));

    return { ok: true, claimed: false, sessionId };
  }

  // 2. Atomic slot claim (CONTRACT §6)
  const result = await db.execute<{
    viewers_used: number;
    max_viewers: number;
    status: string;
  }>(sql`
    UPDATE share_links
       SET viewers_used = viewers_used + 1
     WHERE id = ${linkId}
       AND status = 'active'
       AND viewers_used < max_viewers
       AND (expires_at IS NULL OR expires_at > now())
    RETURNING viewers_used, max_viewers, status;
  `);

  const rawRows: any[] = Array.isArray(result)
    ? result
    : (result as any)?.rows || [];

  if (!rawRows || rawRows.length === 0) {
    // Zero rows returned -> query exact reason (exhausted / expired / revoked)
    const [current] = await db
      .select({
        status: shareLinks.status,
        expiresAt: shareLinks.expiresAt,
        viewersUsed: shareLinks.viewersUsed,
        maxViewers: shareLinks.maxViewers,
      })
      .from(shareLinks)
      .where(eq(shareLinks.id, linkId))
      .limit(1);

    if (!current) {
      return { ok: false, error: "NOT_FOUND" };
    }
    if (current.status === "revoked") {
      return { ok: false, error: "LINK_REVOKED" };
    }
    if (current.status === "unlocked") {
      // Unlocked links are free to view/download by the client
      return { ok: true, claimed: false, sessionId };
    }
    if (current.expiresAt && new Date(current.expiresAt).getTime() <= Date.now()) {
      return { ok: false, error: "LINK_EXPIRED" };
    }
    if (current.viewersUsed >= current.maxViewers) {
      return { ok: false, error: "VIEWERS_EXHAUSTED" };
    }

    return { ok: false, error: "ACCESS_DENIED" };
  }

  const row = rawRows[0];
  const viewersUsed = row.viewers_used ?? row.viewersUsed ?? 1;
  const maxViewers = row.max_viewers ?? row.maxViewers ?? 1;

  // 3. If viewers_used has now reached max_viewers, transition status to viewers_exhausted
  if (viewersUsed >= maxViewers) {
    await db
      .update(shareLinks)
      .set({ status: "viewers_exhausted" })
      .where(eq(shareLinks.id, linkId));
  }

  // 4. Create viewer_sessions record
  await db.insert(viewerSessions).values({
    id: sessionId,
    linkId,
    ipHash,
    uaHash,
  });

  // 5. Audit log
  await db.insert(auditLog).values({
    actorType: "viewer",
    actorId: sessionId,
    entity: "share_link",
    entityId: linkId,
    action: "viewer_opened",
    metaJson: {
      viewersUsed: row.viewers_used,
      maxViewers: row.max_viewers,
    },
  });

  return { ok: true, claimed: true, sessionId };
}

/**
 * Validates passcode with 5-try / 15-minute lockout (CONTRACT §6).
 */
export async function verifyLinkPasscode(
  linkId: string,
  passcode: string,
  clientIp: string
): Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }> {
  const rateLimitKey = `passcode:${clientIp}:${linkId}`;
  const rateCheck = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

  if (!rateCheck.allowed) {
    return {
      ok: false,
      error: "RATE_LIMITED",
      retryAfterSeconds: rateCheck.resetInSeconds,
    };
  }

  const [link] = await db
    .select({ passcodeHash: shareLinks.passcodeHash })
    .from(shareLinks)
    .where(eq(shareLinks.id, linkId))
    .limit(1);

  if (!link || !link.passcodeHash) {
    return { ok: true };
  }

  const matches = await verifyPassword(link.passcodeHash, passcode);
  if (!matches) {
    return { ok: false, error: "PASSCODE_WRONG" };
  }

  return { ok: true };
}

/**
 * Rewrites an HLS playlist to inject signed stream tokens into all segment URLs (CONTRACT §6).
 */
export async function getRewrittenPlaylist(params: {
  slug: string;
  linkId: string;
  projectId: string;
  streamToken: string;
}): Promise<string | null> {
  const { slug, projectId, streamToken } = params;

  // 1. Find latest ready rendition for project
  const [rendition] = await db
    .select()
    .from(renditions)
    .where(
      and(
        eq(renditions.projectId, projectId),
        eq(renditions.type, "preview_hls"),
        eq(renditions.status, "ready")
      )
    )
    .orderBy(desc(renditions.version))
    .limit(1);

  if (!rendition) {
    return null;
  }

  const playlistPath = rendition.localPath;
  if (!fs.existsSync(playlistPath)) {
    return null;
  }

  const playlistContent = fs.readFileSync(playlistPath, "utf-8");

  // 2. Rewrite segment lines (e.g. seg_000.ts -> /api/v/:slug/seg/seg_000.ts?t=...)
  const lines = playlistContent.split("\n");
  const rewrittenLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      const segmentFilename = path.basename(trimmed);
      return `/api/v/${slug}/seg/${segmentFilename}?t=${encodeURIComponent(streamToken)}`;
    }
    return line;
  });

  return rewrittenLines.join("\n");
}

/**
 * Resolves local path of an HLS segment file.
 */
export async function getSegmentPath(params: {
  projectId: string;
  segmentFilename: string;
}): Promise<string | null> {
  const { projectId, segmentFilename } = params;

  // Ensure safe filename without directory traversal
  const safeFilename = path.basename(segmentFilename);
  if (!safeFilename.endsWith(".ts")) {
    return null;
  }

  const [rendition] = await db
    .select()
    .from(renditions)
    .where(
      and(
        eq(renditions.projectId, projectId),
        eq(renditions.type, "preview_hls"),
        eq(renditions.status, "ready")
      )
    )
    .orderBy(desc(renditions.version))
    .limit(1);

  if (!rendition) {
    return null;
  }

  const segmentPath = path.join(path.dirname(rendition.localPath), safeFilename);
  if (!fs.existsSync(segmentPath)) {
    return null;
  }

  return segmentPath;
}
