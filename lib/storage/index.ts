import { env } from "@/lib/env";
import { GoogleDriveProvider } from "./google-drive";
import { MockStorageProvider } from "./mock";
import type { StorageProvider } from "./types";

let storageProviderInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageProviderInstance) {
    if (
      process.env.STORAGE_PROVIDER === "mock" ||
      process.env.USE_MOCK_STORAGE === "true"
    ) {
      storageProviderInstance = new MockStorageProvider();
    } else {
      storageProviderInstance = new GoogleDriveProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        refreshToken: env.GOOGLE_REFRESH_TOKEN,
        rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
      });
    }
  }
  return storageProviderInstance;
}

export * from "./types";
export * from "./google-drive";
export * from "./mock";
