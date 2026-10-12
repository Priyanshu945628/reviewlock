import fs from "node:fs";
import https from "node:https";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import type {
  StorageProvider,
  PutOriginalParams,
  PutOriginalResult,
  StreamOriginalOptions,
  StreamOriginalResult,
} from "./types";

interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  rootFolderId: string;
}

/**
 * Exponential backoff retry wrapper for Drive API calls (handling 429 and 5xx).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelayMs = 500
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const status = error?.status || error?.response?.status || error?.code;
      const isRateLimit = status === 429;
      const isServerError = typeof status === "number" && status >= 500 && status < 600;
      const isTransient = isRateLimit || isServerError;

      if (attempt > maxRetries || !isTransient) {
        throw error;
      }

      // Add jitter
      const jitter = Math.random() * 200;
      const waitTime = delay + jitter;
      console.warn(
        `[DriveProvider] Transient error (${status}). Retrying in ${Math.round(waitTime)}ms (attempt ${attempt}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      delay *= 2;
    }
  }
}

/**
 * Calculates MD5 checksum for a local file stream.
 */
export async function computeFileMd5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export class GoogleDriveProvider implements StorageProvider {
  private oauth2Client;
  private drive: drive_v3.Drive;
  private rootFolderId: string;

  constructor(config: GoogleDriveConfig) {
    this.rootFolderId = config.rootFolderId;
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret
    );
    this.oauth2Client.setCredentials({
      refresh_token: config.refreshToken,
    });
    this.drive = google.drive({ version: "v3", auth: this.oauth2Client });
  }

  private resolvedRootFolderId: string | null = null;

  /**
   * Resolves the root folder ID.
   * If rootFolderId is already a valid Drive folder ID, uses it.
   * If rootFolderId is a folder name (e.g. 'ReviewLock-Originals') or if direct lookup returns 404,
   * searches Drive by name. If not found, creates the folder on Drive automatically.
   */
  public async getResolvedRootFolderId(): Promise<string> {
    if (this.resolvedRootFolderId) {
      return this.resolvedRootFolderId;
    }

    // 1. Try checking as direct Drive ID
    try {
      const res = await withRetry(() =>
        this.drive.files.get({
          fileId: this.rootFolderId,
          fields: "id, name, mimeType, trashed",
          supportsAllDrives: true,
        })
      );
      if (res.data.id && !res.data.trashed) {
        this.resolvedRootFolderId = res.data.id;
        return res.data.id;
      }
    } catch {
      // 404 or invalid ID: proceed to search by folder name
    }

    // 2. Search for existing folder with name matching this.rootFolderId
    const safeName = this.rootFolderId.replace(/'/g, "\\'");
    const listRes = await withRetry(() =>
      this.drive.files.list({
        q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name)",
        spaces: "drive",
      })
    );

    if (listRes.data.files && listRes.data.files.length > 0) {
      const foundId = listRes.data.files[0].id!;
      console.log(`[DriveProvider] Resolved root folder "${this.rootFolderId}" to Google Drive folder ID: ${foundId}`);
      this.resolvedRootFolderId = foundId;
      return foundId;
    }

    // 3. Folder does not exist yet -> Create it automatically
    const createRes = await withRetry(() =>
      this.drive.files.create({
        requestBody: {
          name: this.rootFolderId,
          mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id, name",
      })
    );

    if (!createRes.data.id) {
      throw new Error(`Failed to create root folder "${this.rootFolderId}" on Google Drive.`);
    }

    console.log(`[DriveProvider] Created missing root folder "${this.rootFolderId}" on Drive (ID: ${createRes.data.id})`);
    this.resolvedRootFolderId = createRes.data.id;
    return createRes.data.id;
  }

  /**
   * Helper to locate or create a dedicated subfolder for the project under root folder:
   * <rootFolderId>/<projectId>/
   */
  private async getOrCreateProjectFolder(projectId: string): Promise<string> {
    const rootId = await this.getResolvedRootFolderId();
    const listRes = await withRetry(() =>
      this.drive.files.list({
        q: `'${rootId}' in parents and name = '${projectId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name)",
        spaces: "drive",
      })
    );

    if (listRes.data.files && listRes.data.files.length > 0) {
      return listRes.data.files[0].id!;
    }

    const createRes = await withRetry(() =>
      this.drive.files.create({
        requestBody: {
          name: projectId,
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootId],
        },
        fields: "id",
      })
    );

    if (!createRes.data.id) {
      throw new Error(`Failed to create project folder on Google Drive for project: ${projectId}`);
    }

    return createRes.data.id;
  }

  /**
   * Uploads an original video using Google Drive Resumable Upload protocol.
   * Verifies remote file size and MD5 against the local file before resolving.
   */
  async putOriginal(params: PutOriginalParams): Promise<PutOriginalResult> {
    const { projectId, filename, filePath, mimeType } = params;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found for upload: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const localSize = stat.size;
    const localMd5 = params.expectedMd5 || (await computeFileMd5(filePath));

    // 1. Ensure project folder exists
    const projectFolderId = await this.getOrCreateProjectFolder(projectId);

    // 2. Obtain fresh access token for resumable upload session initialization
    const { token } = await this.oauth2Client.getAccessToken();
    if (!token) {
      throw new Error("Unable to obtain Google OAuth access token for resumable upload");
    }

    // 3. Initiate resumable upload session
    const initUrl =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum";
    const initMetadata = {
      name: filename,
      parents: [projectFolderId],
    };

    const initResponse = await withRetry(async () => {
      const res = await fetch(initUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(localSize),
        },
        body: JSON.stringify(initMetadata),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Failed to initiate resumable upload session (HTTP ${res.status}): ${text}`
        );
      }
      return res;
    });

    const sessionUri = initResponse.headers.get("location");
    if (!sessionUri) {
      throw new Error("Google Drive did not return a resumable upload session URI (Location header missing)");
    }

    // 4. Stream upload file to the session URI with Content-Range
    const uploadedData = await withRetry(async () => {
      return new Promise<{ id: string; size: string; md5Checksum: string }>(
        (resolve, reject) => {
          const sessionUrl = new URL(sessionUri);
          const req = https.request(
            sessionUrl,
            {
              method: "PUT",
              headers: {
                "Content-Length": localSize,
                "Content-Range": `bytes 0-${localSize - 1}/${localSize}`,
                "Content-Type": mimeType,
              },
            },
            (res) => {
              let body = "";
              res.setEncoding("utf8");
              res.on("data", (chunk) => {
                body += chunk;
              });
              res.on("end", () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                  try {
                    resolve(JSON.parse(body));
                  } catch (parseErr) {
                    reject(parseErr);
                  }
                } else {
                  reject(
                    new Error(
                      `Resumable upload failed (HTTP ${res.statusCode}): ${body}`
                    )
                  );
                }
              });
            }
          );

          req.on("error", reject);
          const fileStream = fs.createReadStream(filePath);
          fileStream.on("error", reject);
          fileStream.pipe(req);
        }
      );
    });

    const remoteSize = parseInt(uploadedData.size, 10);
    const remoteMd5 = uploadedData.md5Checksum?.toLowerCase();

    // 5. Verification: Verify size and md5Checksum against local file
    if (remoteSize !== localSize || remoteMd5 !== localMd5.toLowerCase()) {
      // Clean up remote file on verification failure
      try {
        await this.drive.files.delete({ fileId: uploadedData.id });
      } catch (cleanupErr) {
        console.error("Failed to delete corrupted upload on Drive:", cleanupErr);
      }

      throw new Error(
        `Drive verification failed! Size mismatch (local: ${localSize}, remote: ${remoteSize}) or MD5 mismatch (local: ${localMd5}, remote: ${remoteMd5})`
      );
    }

    return {
      fileId: uploadedData.id,
      size: remoteSize,
      md5Checksum: remoteMd5,
    };
  }

  /**
   * Streams the original file live from Google Drive with Range header passthrough.
   * Flat memory footprint, never downloads first.
   */
  async streamOriginal(
    fileId: string,
    options?: StreamOriginalOptions
  ): Promise<StreamOriginalResult> {
    const headers: Record<string, string> = {};
    if (options?.range) {
      headers["Range"] = options.range;
    }

    const driveRes = await withRetry(() =>
      this.drive.files.get(
        {
          fileId,
          alt: "media",
        },
        {
          responseType: "stream",
          headers,
          signal: options?.signal,
        }
      )
    );

    const hasRange = Boolean(options?.range);
    const isPartial = hasRange && Boolean(driveRes.headers["content-range"]);
    const statusCode = isPartial ? 206 : driveRes.status || 200;

    const contentLength = driveRes.headers["content-length"]
      ? parseInt(driveRes.headers["content-length"], 10)
      : undefined;

    const contentRange = driveRes.headers["content-range"] as string | undefined;
    const contentType =
      (driveRes.headers["content-type"] as string | undefined) ||
      "application/octet-stream";

    return {
      stream: driveRes.data as Readable,
      statusCode,
      contentLength,
      contentRange,
      contentType,
      acceptRanges: "bytes",
    };
  }

  /**
   * Deletes a file from Google Drive.
   */
  async deleteOriginal(fileId: string): Promise<void> {
    await withRetry(() => this.drive.files.delete({ fileId }));
  }

  /**
   * Pings Drive root folder to verify API reachability and valid credentials.
   */
  async ping(): Promise<boolean> {
    try {
      const folderId = await this.getResolvedRootFolderId();
      return Boolean(folderId);
    } catch (err) {
      console.error("[DriveProvider] Ping check failed:", err);
      return false;
    }
  }

  /**
   * Audits root folder permissions to confirm NO public sharing exists (CONTRACT §4 & CHUNKS B7).
   * Confirms that 'anyoneWithLink' or 'anyone' permissions are absent.
   */
  async auditFolderPermissions(): Promise<{
    secure: boolean;
    permissions: any[];
    warnings: string[];
  }> {
    const folderId = await this.getResolvedRootFolderId();
    const res = await withRetry(() =>
      this.drive.permissions.list({
        fileId: folderId,
        fields: "permissions(id, type, role, allowFileDiscovery)",
      })
    );

    const permissions = res.data.permissions || [];
    const warnings: string[] = [];
    let secure = true;

    for (const perm of permissions) {
      if (perm.type === "anyone") {
        secure = false;
        warnings.push(
          `Insecure permission detected: type='anyone', role='${perm.role}' on root folder.`
        );
      }
    }

    return { secure, permissions, warnings };
  }
}
