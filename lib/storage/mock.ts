import fs from "node:fs";
import path from "node:path";
import type {
  StorageProvider,
  PutOriginalParams,
  PutOriginalResult,
  StreamOriginalOptions,
  StreamOriginalResult,
} from "./types";
import { computeFileMd5 } from "./google-drive";

export class MockStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir = "./data/mock-drive") {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async putOriginal(params: PutOriginalParams): Promise<PutOriginalResult> {
    const { projectId, filename, filePath } = params;
    const destDir = path.join(this.baseDir, projectId);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, filename);

    fs.copyFileSync(filePath, destPath);

    const stat = fs.statSync(destPath);
    const md5 = await computeFileMd5(destPath);

    if (params.expectedMd5 && params.expectedMd5.toLowerCase() !== md5.toLowerCase()) {
      fs.unlinkSync(destPath);
      throw new Error(`MD5 mismatch: expected ${params.expectedMd5}, computed ${md5}`);
    }

    return {
      fileId: `${projectId}/${filename}`,
      size: stat.size,
      md5Checksum: md5,
    };
  }

  async streamOriginal(
    fileId: string,
    options?: StreamOriginalOptions
  ): Promise<StreamOriginalResult> {
    const fullPath = path.join(this.baseDir, fileId);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found in storage: ${fileId}`);
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;

    let start = 0;
    let end = fileSize - 1;
    let isPartial = false;

    if (options?.range) {
      const match = options.range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        start = parseInt(match[1], 10);
        if (match[2]) {
          end = parseInt(match[2], 10);
        }
        isPartial = true;
      }
    }

    const stream = fs.createReadStream(fullPath, { start, end });
    const contentLength = end - start + 1;
    const contentRange = isPartial ? `bytes ${start}-${end}/${fileSize}` : undefined;

    return {
      stream,
      statusCode: isPartial ? 206 : 200,
      contentLength,
      contentRange,
      contentType: "application/octet-stream",
      acceptRanges: "bytes",
    };
  }

  async deleteOriginal(fileId: string): Promise<void> {
    const fullPath = path.join(this.baseDir, fileId);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
