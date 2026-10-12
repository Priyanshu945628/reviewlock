import type { Readable } from "node:stream";

export interface PutOriginalParams {
  projectId: string;
  filename: string;
  filePath: string;
  mimeType: string;
  expectedMd5?: string;
  expectedSize?: number;
}

export interface PutOriginalResult {
  fileId: string;
  size: number;
  md5Checksum: string;
}

export interface StreamOriginalOptions {
  range?: string;
  signal?: AbortSignal;
}

export interface StreamOriginalResult {
  stream: Readable;
  statusCode: number;
  contentLength?: number;
  contentRange?: string;
  contentType: string;
  acceptRanges: string;
}

export interface StorageProvider {
  /**
   * Upload an original video using Google Drive Resumable Upload API.
   * Verifies remote size and MD5 against the local file before resolving.
   */
  putOriginal(params: PutOriginalParams): Promise<PutOriginalResult>;

  /**
   * Stream the original video directly with Range request passthrough.
   * Flat memory footprint, never downloads to server disk first.
   */
  streamOriginal(fileId: string, options?: StreamOriginalOptions): Promise<StreamOriginalResult>;

  /**
   * Delete an original file from storage.
   */
  deleteOriginal(fileId: string): Promise<void>;

  /**
   * Healthcheck to verify storage access and root folder reachability.
   */
  ping(): Promise<boolean>;
}
