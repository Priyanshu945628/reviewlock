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
  email: "priyanshu@reviewlock.io",
  displayName: "Priyanshu",
  storageUsedBytes: 6.2 * 1024 * 1024 * 1024, // 6.2 GB
  storageLimitBytes: 20 * 1024 * 1024 * 1024, // 20 GB
};

export const MOCK_PROJECTS: MockProject[] = [
  {
    id: "proj_wedding_reel",
    userId: "usr_priyanshu_01",
    title: "Wedding_Reel_v3.mp4",
    status: "ready",
    originalFilename: "Wedding_Reel_v3.mp4",
    originalSize: 2.9 * 1024 * 1024 * 1024, // 2.9 GB
    durationSeconds: 252, // 4:12
    width: 1920,
    height: 1080,
    driveFileId: "drive_mock_file_001",
    driveMd5: "d41d8cd98f00b204e9800998ecf8427e",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    linkCount: 2,
    viewedCount: 1,
    lastViewedRelative: "3d ago",
    statusLabel: "READY",
  },
  {
    id: "proj_brand_promo",
    userId: "usr_priyanshu_01",
    title: "Brand_Promo_Final.mov",
    status: "ready",
    originalFilename: "Brand_Promo_Final.mov",
    originalSize: 1.4 * 1024 * 1024 * 1024, // 1.4 GB
    durationSeconds: 108, // 1:48
    width: 3840,
    height: 2160,
    driveFileId: "drive_mock_file_002",
    driveMd5: "0cc175b9c0f1b6a831c399e269772661",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    linkCount: 1,
    viewedCount: 0,
    lastViewedRelative: "1d ago",
    statusLabel: "READY",
  },
  {
    id: "proj_podcast_ep14",
    userId: "usr_priyanshu_01",
    title: "Podcast_Ep14_Cut.mp4",
    status: "processing",
    originalFilename: "Podcast_Ep14_Cut.mp4",
    originalSize: 1.9 * 1024 * 1024 * 1024, // 1.9 GB
    durationSeconds: 2285, // 38:05
    width: 1920,
    height: 1080,
    driveFileId: null,
    driveMd5: null,
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    linkCount: 0,
    viewedCount: 0,
    lastViewedRelative: "just now",
    statusLabel: "PROCESSING",
  },
];

export const MOCK_SHARE_LINKS: MockShareLink[] = [
  {
    id: "link_rahul_wedding",
    projectId: "proj_wedding_reel",
    slug: "x7Kq9Zr2",
    clientLabel: "Rahul – Wedding Reel",
    visibility: "private",
    previewMode: "first_n",
    previewStart: 0,
    previewEnd: 30,
    maxViewers: 1,
    viewersUsed: 1,
    allowPreviewDownload: true,
    watermarkText: "PREVIEW · NOT PAID",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    status: "live",
    unlockedAt: null,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "link_studio_kala",
    projectId: "proj_brand_promo",
    slug: "m4P2sK91",
    clientLabel: "Studio Kala – Promo",
    visibility: "public",
    previewMode: "custom",
    previewStart: 10,
    previewEnd: 40,
    maxViewers: 3,
    viewersUsed: 0,
    allowPreviewDownload: false,
    watermarkText: "CONFIDENTIAL PREVIEW",
    expiresAt: null,
    status: "live",
    unlockedAt: null,
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
];
