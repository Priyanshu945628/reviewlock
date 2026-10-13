// Shared application types for ReviewLock

export interface User {
  id: string;
  email: string;
  displayName?: string;
  storageUsedBytes: number;
  storageLimitBytes?: number;
  createdAt?: string;
}

export type ProjectStatus = "uploaded" | "processing" | "ready" | "failed";

export interface Project {
  id: string;
  userId: string;
  title: string;
  status: ProjectStatus;
  originalFilename: string;
  originalSize: number;
  durationSeconds: number;
  width: number;
  height: number;
  driveFileId: string | null;
  driveMd5: string | null;
  createdAt: string;
  linkCount?: number;
  viewedCount?: number;
  lastViewedRelative?: string;
  statusLabel?: string;
}

export interface ShareLink {
  id: string;
  projectId: string;
  slug: string;
  clientLabel: string;
  visibility: "public" | "private";
  previewMode: "first_n_seconds" | "custom_segment" | "first_n" | "custom" | string;
  previewStart: number;
  previewEnd: number;
  maxViewers: number;
  viewersUsed: number;
  allowPreviewDownload: boolean;
  watermarkText: string;
  expiresAt: string | null;
  status:
    | "active"
    | "live"
    | "viewers_exhausted"
    | "expired"
    | "revoked"
    | "unlocked"
    | string;
  unlockedAt: string | null;
  createdAt: string;
}
