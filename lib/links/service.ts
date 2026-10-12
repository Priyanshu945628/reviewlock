// Share Link Engine conforming to CONTRACT §6, §7 & §9
// 128-bit base64url slugs, Argon2id passcode hashing, state machine, audit log, and preview pipeline re-run

import crypto from "node:crypto";
import path from "node:path";
import * as fs from "node:fs";
import { db } from "@/lib/db";
import {
  shareLinks,
  projects,
  renditions,
  auditLog,
  viewerSessions,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generatePreviewHls, generatePreviewMp4 } from "@/lib/video/ffmpeg";
import { getStorageProvider } from "@/lib/storage";
import { env } from "@/lib/env";

export type ShareLinkStatus =
  | "created"
  | "active"
  | "viewers_exhausted"
  | "expired"
  | "revoked"
  | "unlocked";

export interface CreateShareLinkParams {
  projectId: string;
  userId: string;
  clientLabel?: string;
  visibility?: "public" | "private";
  passcode?: string;
  previewMode?: "first_n_seconds" | "custom_segment";
  previewStart?: number;
  previewEnd?: number;
  maxViewers?: number;
  allowPreviewDownload?: boolean;
  watermarkText?: string;
  expiresAt?: string | null;
}

export interface UpdateShareLinkParams {
  clientLabel?: string;
  visibility?: "public" | "private";
  passcode?: string;
  previewMode?: "first_n_seconds" | "custom_segment";
  previewStart?: number;
  previewEnd?: number;
  maxViewers?: number;
  allowPreviewDownload?: boolean;
  watermarkText?: string;
  expiresAt?: string | null;
}

/**
 * Generates a cryptographically secure 128-bit random base64url slug (CONTRACT §6)
 * 16 bytes = 128 bits of entropy.
 */
export function generateSlug(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * State machine validator (CONTRACT §6):
 * created → active → viewers_exhausted | expired | revoked → unlocked
 * Editor can unlock from any state.
 */
export function isValidStateTransition(
  currentStatus: ShareLinkStatus,
  targetStatus: ShareLinkStatus
): boolean {
  if (currentStatus === targetStatus) return true;

  // Editor can unlock from ANY state (CONTRACT §6)
  if (targetStatus === "unlocked") return true;

  // Revoke is allowed from all active/exhausted/expired/created states
  if (targetStatus === "revoked") {
    return currentStatus !== "unlocked";
  }

  switch (currentStatus) {
    case "created":
      return targetStatus === "active";
    case "active":
      return (
        targetStatus === "viewers_exhausted" ||
        targetStatus === "expired"
      );
    case "viewers_exhausted":
      return targetStatus === "expired";
    case "expired":
      return false;
    case "revoked":
      return false;
    case "unlocked":
      return false;
    default:
      return false;
  }
}

/**
 * Creates a new share link for a project.
 */
export async function createShareLink(params: CreateShareLinkParams) {
  const {
    projectId,
    userId,
    clientLabel,
    visibility = "private",
    passcode,
    previewMode = "first_n_seconds",
    previewStart = 0,
    previewEnd,
    maxViewers = 1,
    allowPreviewDownload = false,
    watermarkText = "PREVIEW · NOT PAID",
    expiresAt,
  } = params;

  // 1. Verify project ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  // 2. Hash passcode if private and provided
  let passcodeHash: string | null = null;
  if (visibility === "private" && passcode && passcode.trim().length > 0) {
    passcodeHash = await hashPassword(passcode.trim());
  }

  // 3. Generate 128-bit slug
  const slug = generateSlug();

  // 4. Determine initial end time if not specified
  const effectiveEnd =
    previewEnd !== undefined && previewEnd !== null
      ? previewEnd
      : Math.min(30, project.durationSeconds || 30);

  // 5. Insert share link with status 'active'
  const [created] = await db
    .insert(shareLinks)
    .values({
      projectId,
      slug,
      clientLabel: clientLabel?.trim() || "Client Link",
      visibility,
      passcodeHash,
      previewMode,
      previewStart,
      previewEnd: effectiveEnd,
      maxViewers: Math.max(1, maxViewers),
      viewersUsed: 0,
      allowPreviewDownload,
      watermarkText: watermarkText.trim() || "PREVIEW · NOT PAID",
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: "active",
    })
    .returning();

  // 6. Record in audit_log
  await db.insert(auditLog).values({
    actorType: "editor",
    actorId: userId,
    entity: "share_link",
    entityId: created.id,
    action: "link_created",
    metaJson: {
      slug: created.slug,
      clientLabel: created.clientLabel,
      visibility: created.visibility,
      previewStart: created.previewStart,
      previewEnd: created.previewEnd,
      maxViewers: created.maxViewers,
      expiresAt: created.expiresAt?.toISOString() || null,
    },
  });

  return created;
}

/**
 * Lists all share links for a project (editor only).
 */
export async function getProjectShareLinks(projectId: string, userId: string) {
  // Verify ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  return await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.projectId, projectId))
    .orderBy(desc(shareLinks.createdAt));
}

/**
 * Re-runs the preview pipeline for a project (CONTRACT §7).
 * Creates a new rendition version. The old version remains active until the new one is ready.
 */
export async function rerunPreviewPipeline(params: {
  projectId: string;
  previewStart: number;
  previewEnd: number;
  watermarkText: string;
}) {
  const { projectId, previewStart, previewEnd, watermarkText } = params;

  // 1. Fetch project and latest rendition version
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return;

  const existingRenditions = await db
    .select()
    .from(renditions)
    .where(eq(renditions.projectId, projectId))
    .orderBy(desc(renditions.version));

  const latestVersion = existingRenditions.length > 0 ? existingRenditions[0].version : 1;
  const nextVersion = latestVersion + 1;

  const renditionDir = path.join(
    env.DATA_DIR,
    "renditions",
    projectId,
    `v${nextVersion}`
  );
  const hlsDir = path.join(renditionDir, "hls");
  const mp4Path = path.join(renditionDir, "preview.mp4");

  await fs.promises.mkdir(hlsDir, { recursive: true });

  // 2. Identify input source: local original or cached upload
  let inputPath = path.join(env.DATA_DIR, "uploads", projectId, project.originalFilename);
  let tempDownloaded = false;

  if (!fs.existsSync(inputPath)) {
    // Check if another local video file exists in data/uploads
    const altUploadDir = path.join(env.DATA_DIR, "uploads", projectId);
    if (fs.existsSync(altUploadDir)) {
      const files = fs.readdirSync(altUploadDir);
      const videoFile = files.find((f) => !f.startsWith(".") && !f.endsWith(".part"));
      if (videoFile) {
        inputPath = path.join(altUploadDir, videoFile);
      }
    }
  }

  // If local file still does not exist, download from Drive
  if (!fs.existsSync(inputPath) && project.driveFileId) {
    const tempDir = path.join(env.DATA_DIR, "temp");
    await fs.promises.mkdir(tempDir, { recursive: true });
    inputPath = path.join(tempDir, `src_${projectId}_v${nextVersion}.mp4`);
    const storage = getStorageProvider();
    const { stream: driveStream } = await storage.streamOriginal(project.driveFileId);
    const writeStream = fs.createWriteStream(inputPath);
    await new Promise<void>((resolve, reject) => {
      driveStream.pipe(writeStream);
      driveStream.on("error", reject);
      writeStream.on("finish", () => resolve());
      writeStream.on("error", reject);
    });
    tempDownloaded = true;
  }

  if (!fs.existsSync(inputPath)) {
    console.warn(`[Pipeline] Source video not found for rendition v${nextVersion} of ${projectId}`);
    return;
  }

  try {
    // 3. Insert pending rendition records
    const [hlsRendition] = await db
      .insert(renditions)
      .values({
        projectId,
        version: nextVersion,
        type: "preview_hls",
        localPath: path.join(hlsDir, "master.m3u8"),
        duration: previewEnd - previewStart,
        status: "pending",
      })
      .returning();

    const [mp4Rendition] = await db
      .insert(renditions)
      .values({
        projectId,
        version: nextVersion,
        type: "preview_mp4",
        localPath: mp4Path,
        duration: previewEnd - previewStart,
        status: "pending",
      })
      .returning();

    // 4. Generate HLS preview
    await generatePreviewHls({
      inputPath,
      outputDir: hlsDir,
      startSeconds: previewStart,
      endSeconds: previewEnd,
      maxHeight: env.PREVIEW_MAX_HEIGHT,
      watermarkText,
    });

    // 5. Generate MP4 preview
    await generatePreviewMp4({
      inputPath,
      outputPath: mp4Path,
      startSeconds: previewStart,
      endSeconds: previewEnd,
      maxHeight: env.PREVIEW_MAX_HEIGHT,
      watermarkText,
    });

    // 6. Mark renditions as ready
    await db
      .update(renditions)
      .set({ status: "ready" })
      .where(eq(renditions.id, hlsRendition.id));

    await db
      .update(renditions)
      .set({ status: "ready" })
      .where(eq(renditions.id, mp4Rendition.id));

    // 7. Audit log
    await db.insert(auditLog).values({
      actorType: "system",
      entity: "rendition",
      entityId: `${projectId}:v${nextVersion}`,
      action: "rendition_regenerated",
      metaJson: {
        version: nextVersion,
        previewStart,
        previewEnd,
        watermarkText,
      },
    });
  } finally {
    if (tempDownloaded && fs.existsSync(inputPath)) {
      try {
        fs.unlinkSync(inputPath);
      } catch {}
    }
  }
}

/**
 * Updates an existing share link's settings.
 * Re-runs preview pipeline if preview range or watermark text changed (CONTRACT §7).
 */
export async function updateShareLink(
  linkId: string,
  userId: string,
  updateData: UpdateShareLinkParams
) {
  // 1. Fetch link and verify project ownership
  const [link] = await db
    .select({
      link: shareLinks,
      project: projects,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(and(eq(shareLinks.id, linkId), eq(projects.userId, userId)))
    .limit(1);

  if (!link) {
    throw new Error("LINK_NOT_FOUND");
  }

  const current = link.link;

  if (current.status === "revoked") {
    throw new Error("CANNOT_MODIFY_REVOKED_LINK");
  }

  // 2. Prepare update payload
  const fieldsToUpdate: Partial<typeof shareLinks.$inferInsert> = {};

  if (updateData.clientLabel !== undefined) {
    fieldsToUpdate.clientLabel = updateData.clientLabel.trim();
  }

  if (updateData.visibility !== undefined) {
    fieldsToUpdate.visibility = updateData.visibility;
    if (updateData.visibility === "public") {
      fieldsToUpdate.passcodeHash = null;
    }
  }

  if (updateData.passcode !== undefined) {
    if (updateData.passcode && updateData.passcode.trim().length > 0) {
      fieldsToUpdate.passcodeHash = await hashPassword(updateData.passcode.trim());
      fieldsToUpdate.visibility = "private";
    }
  }

  if (updateData.maxViewers !== undefined) {
    fieldsToUpdate.maxViewers = Math.max(1, updateData.maxViewers);
  }

  if (updateData.allowPreviewDownload !== undefined) {
    fieldsToUpdate.allowPreviewDownload = updateData.allowPreviewDownload;
  }

  if (updateData.expiresAt !== undefined) {
    fieldsToUpdate.expiresAt = updateData.expiresAt
      ? new Date(updateData.expiresAt)
      : null;
  }

  const rangeOrWatermarkChanged =
    (updateData.previewStart !== undefined &&
      updateData.previewStart !== current.previewStart) ||
    (updateData.previewEnd !== undefined &&
      updateData.previewEnd !== current.previewEnd) ||
    (updateData.watermarkText !== undefined &&
      updateData.watermarkText.trim() !== current.watermarkText);

  if (updateData.previewMode !== undefined) {
    fieldsToUpdate.previewMode = updateData.previewMode;
  }
  if (updateData.previewStart !== undefined) {
    fieldsToUpdate.previewStart = updateData.previewStart;
  }
  if (updateData.previewEnd !== undefined) {
    fieldsToUpdate.previewEnd = updateData.previewEnd;
  }
  if (updateData.watermarkText !== undefined) {
    fieldsToUpdate.watermarkText = updateData.watermarkText.trim();
  }

  // 3. Update database
  const [updated] = await db
    .update(shareLinks)
    .set(fieldsToUpdate)
    .where(eq(shareLinks.id, linkId))
    .returning();

  // 4. Audit log
  await db.insert(auditLog).values({
    actorType: "editor",
    actorId: userId,
    entity: "share_link",
    entityId: linkId,
    action: "link_updated",
    metaJson: fieldsToUpdate,
  });

  // 5. If range or watermark changed, re-run preview pipeline asynchronously
  if (rangeOrWatermarkChanged) {
    rerunPreviewPipeline({
      projectId: current.projectId,
      previewStart: updated.previewStart,
      previewEnd: updated.previewEnd || 30,
      watermarkText: updated.watermarkText,
    }).catch((err) => {
      console.error("[ShareLink] Error regenerating renditions:", err);
    });
  }

  return updated;
}

/**
 * Revokes a share link.
 */
export async function revokeShareLink(linkId: string, userId: string) {
  const [link] = await db
    .select({
      link: shareLinks,
      project: projects,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(and(eq(shareLinks.id, linkId), eq(projects.userId, userId)))
    .limit(1);

  if (!link) {
    throw new Error("LINK_NOT_FOUND");
  }

  const current = link.link;

  if (current.status === "revoked") {
    return current; // Idempotent
  }

  if (!isValidStateTransition(current.status as ShareLinkStatus, "revoked")) {
    throw new Error(`ILLEGAL_TRANSITION: Cannot revoke from ${current.status}`);
  }

  const [revoked] = await db
    .update(shareLinks)
    .set({ status: "revoked" })
    .where(eq(shareLinks.id, linkId))
    .returning();

  await db.insert(auditLog).values({
    actorType: "editor",
    actorId: userId,
    entity: "share_link",
    entityId: linkId,
    action: "link_revoked",
    metaJson: { previousStatus: current.status },
  });

  return revoked;
}

/**
 * Unlocks a share link (Release full video / mark as paid).
 * Editor can unlock from ANY state (CONTRACT §6).
 */
export async function unlockShareLink(linkId: string, userId: string) {
  const [link] = await db
    .select({
      link: shareLinks,
      project: projects,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(and(eq(shareLinks.id, linkId), eq(projects.userId, userId)))
    .limit(1);

  if (!link) {
    throw new Error("LINK_NOT_FOUND");
  }

  const current = link.link;

  const now = new Date();
  const [unlocked] = await db
    .update(shareLinks)
    .set({
      status: "unlocked",
      unlockedAt: now,
    })
    .where(eq(shareLinks.id, linkId))
    .returning();

  await db.insert(auditLog).values({
    actorType: "editor",
    actorId: userId,
    entity: "share_link",
    entityId: linkId,
    action: "link_unlocked",
    metaJson: {
      previousStatus: current.status,
      unlockedAt: now.toISOString(),
    },
  });

  return unlocked;
}

/**
 * Returns timeline activity events for a share link.
 */
export async function getShareLinkActivity(linkId: string, userId: string) {
  // 1. Verify ownership
  const [link] = await db
    .select({
      link: shareLinks,
      project: projects,
    })
    .from(shareLinks)
    .innerJoin(projects, eq(shareLinks.projectId, projects.id))
    .where(and(eq(shareLinks.id, linkId), eq(projects.userId, userId)))
    .limit(1);

  if (!link) {
    throw new Error("LINK_NOT_FOUND");
  }

  // 2. Fetch audit logs for this link and its parent project
  const logs = await db
    .select()
    .from(auditLog)
    .where(
      sql`(${auditLog.entity} = 'share_link' AND ${auditLog.entityId} = ${linkId}) OR (${auditLog.entity} = 'project' AND ${auditLog.entityId} = ${link.project.id})`
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  // 3. Fetch viewer sessions for this link
  const sessions = await db
    .select()
    .from(viewerSessions)
    .where(eq(viewerSessions.linkId, linkId))
    .orderBy(desc(viewerSessions.firstSeen))
    .limit(50);

  return {
    link: link.link,
    events: logs,
    sessions,
  };
}
