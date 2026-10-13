import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { env } from "@/lib/env";

let cachedBaseDir: string | null = null;

/**
 * Returns a guaranteed writable base directory for local video files & chunks.
 * Falls back through env.DATA_DIR -> /data -> ./data -> /tmp/reviewlock-data.
 */
export async function getWritableBaseDir(): Promise<string> {
  if (cachedBaseDir) {
    try {
      await fs.access(cachedBaseDir);
      return cachedBaseDir;
    } catch {
      cachedBaseDir = null;
    }
  }

  const candidateBases = [
    env.DATA_DIR,
    "/data",
    path.join(process.cwd(), "data"),
    path.join(os.tmpdir(), "reviewlock-data"),
  ];

  for (const base of candidateBases) {
    if (!base) continue;
    try {
      await fs.mkdir(base, { recursive: true });
      const probeFile = path.join(
        base,
        `.probe_${Date.now()}_${Math.random().toString(36).slice(2)}`
      );
      await fs.writeFile(probeFile, "ok");
      await fs.unlink(probeFile);
      cachedBaseDir = base;
      return base;
    } catch (err: any) {
      console.warn(
        `[Storage] Base directory '${base}' is not writable (${err.message}). Trying next candidate...`
      );
    }
  }

  const fallback = path.join(os.tmpdir(), "reviewlock-data");
  await fs.mkdir(fallback, { recursive: true });
  cachedBaseDir = fallback;
  return fallback;
}

/**
 * Returns a guaranteed writable directory for a specific upload session.
 */
export async function getUploadSessionDir(uploadId: string): Promise<string> {
  const base = await getWritableBaseDir();
  const dir = path.join(base, "uploads", uploadId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
