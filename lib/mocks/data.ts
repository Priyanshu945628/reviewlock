// Mock data conforming strictly to DESIGN §12 and CONTRACT §7 / §9

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  storageUsedBytes: number;
  storageLimitBytes: number;
}

export interface MockProject {
  id: string;
  userId: string;
  title: string;
  status: "processing" | "ready" | "failed";
  originalFilename: string;
  originalSize: number;
  durationSeconds: number;
  width: number;
  height: number;
  driveFileId: string | null;
  driveMd5: string | null;
  createdAt: string;
  // Computed / aggregated metadata for display
  linkCount: number;
  viewedCount: number;
  lastViewedRelative: string;
  statusLabel?: string;
}

export interface MockShareLink {
  id: string;
  projectId: string;
  slug: string;
  clientLabel: string;
  visibility: "public" | "private";
  previewMode: "first_n" | "custom";
  previewStart: number;
  previewEnd: number;
  maxViewers: number;
  viewersUsed: number;
  allowPreviewDownload: boolean;
  watermarkText: string;
  expiresAt: string | null;
  status:
    | "live"
    | "viewers_exhausted"
    | "expired"
    | "revoked"
    | "unlocked";
  unlockedAt: string | null;
  createdAt: string;
}

export const MOCK_USER: MockUser = {
  id: "usr_priyanshu_01",
  email: "priyanshu@example.com",
  displayName: "Priyanshu",
  storageUsedBytes: 0,
  storageLimitBytes: 20 * 1024 * 1024 * 1024, // 20 GB
};

export const MOCK_PROJECTS: MockProject[] = [];

export const MOCK_SHARE_LINKS: MockShareLink[] = [];

