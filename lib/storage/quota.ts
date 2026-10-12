// Storage and disk space quota enforcement conforming to CONTRACT §4.0 and §5

import { promises as fs } from "node:fs";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface QuotaCheckResult {
  allowed: boolean;
  code?: "STORAGE_QUOTA_EXCEEDED" | "INSUFFICIENT_SERVER_SPACE" | "FILE_TOO_LARGE";
  message?: string;
}

export async function checkStorageLimits(
  userId: string,
  incomingSizeBytes: number
): Promise<QuotaCheckResult> {
  const maxUploadBytes = env.MAX_UPLOAD_GB * 1024 * 1024 * 1024;
  if (incomingSizeBytes > maxUploadBytes) {
    return {
      allowed: false,
      code: "FILE_TOO_LARGE",
      message: `File size exceeds the maximum upload limit of ${env.MAX_UPLOAD_GB} GB.`,
    };
  }

  const maxUserStorageBytes =
    env.MAX_STORAGE_PER_USER_GB * 1024 * 1024 * 1024;

  const [user] = await db
    .select({ storageUsedBytes: users.storageUsedBytes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return {
      allowed: false,
      code: "STORAGE_QUOTA_EXCEEDED",
      message: "User not found.",
    };
  }

  const projectedUsage = user.storageUsedBytes + incomingSizeBytes;
  if (projectedUsage > maxUserStorageBytes) {
    return {
      allowed: false,
      code: "STORAGE_QUOTA_EXCEEDED",
      message: `Projected storage usage (${(projectedUsage / 1024 / 1024 / 1024).toFixed(2)} GB) exceeds user limit of ${env.MAX_STORAGE_PER_USER_GB} GB.`,
    };
  }

  // Check server disk space on DATA_DIR
  try {
    const dataDir = env.DATA_DIR;
    await fs.mkdir(dataDir, { recursive: true });

    // statfs is available on Node 18.15+
    if (typeof fs.statfs === "function") {
      const stat = await fs.statfs(dataDir);
      const freeBytes = BigInt(stat.bfree) * BigInt(stat.bsize);
      const requiredBytes = BigInt(incomingSizeBytes) * 2n; // 2x incoming size for assembly & transcode temp buffer

      if (freeBytes < requiredBytes) {
        return {
          allowed: false,
          code: "INSUFFICIENT_SERVER_SPACE",
          message: "Server temporary disk space is insufficient to assemble this upload.",
        };
      }
    }
  } catch (err: any) {
    // If statfs fails on non-supporting filesystem, log and allow
    console.warn("[QuotaGuard] statfs check skipped/warn:", err.message);
  }

  return { allowed: true };
}
