import { env } from "@/lib/env";
import { GoogleDriveProvider } from "./google-drive";
import { MockStorageProvider } from "./mock";
import type { StorageProvider } from "./types";

let storageProviderInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageProviderInstance) {
    // 1. Mock storage is ONLY active when explicitly requested via STORAGE_PROVIDER=mock
    if (process.env.STORAGE_PROVIDER === "mock") {
      // 2. Mock storage is strictly forbidden in production
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "FATAL: STORAGE_PROVIDER=mock cannot be used in production (NODE_ENV=production). Real storage provider is required."
        );
      }
      storageProviderInstance = new MockStorageProvider();
      return storageProviderInstance;
    }

    // 3. In all other cases, MUST use GoogleDriveProvider. Missing credentials will fail fast.
    storageProviderInstance = new GoogleDriveProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_REFRESH_TOKEN,
      rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    });
  }
  return storageProviderInstance;
}

/**
 * Resets the cached singleton provider (used for test isolation).
 */
export function resetStorageProvider(): void {
  storageProviderInstance = null;
}

export * from "./types";
export * from "./google-drive";
export * from "./mock";
