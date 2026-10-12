// pg-boss job queue integration conforming to CONTRACT §5 and B2/B3 specs

import PgBoss from "pg-boss";
import { env } from "@/lib/env";

export const PROCESS_PROJECT_QUEUE = "process-project";

export interface ProcessProjectJobPayload {
  projectId: string;
  uploadId: string;
  originalPath: string;
  originalFilename: string;
}

let bossInstance: PgBoss | null = null;
let isStarted = false;

export async function getPgBoss(): Promise<PgBoss> {
  if (bossInstance && isStarted) {
    return bossInstance;
  }

  if (!bossInstance) {
    bossInstance = new PgBoss({
      connectionString: env.DATABASE_URL,
      max: 4,
    });

    bossInstance.on("error", (error) => {
      console.error("[pg-boss] Error:", error);
    });
  }

  if (!isStarted) {
    await bossInstance.start();
    isStarted = true;
  }

  return bossInstance;
}

export async function enqueueProcessProject(
  payload: ProcessProjectJobPayload
): Promise<string | null> {
  try {
    const boss = await getPgBoss();
    const jobId = await boss.send(PROCESS_PROJECT_QUEUE, payload, {
      retryLimit: 3,
      retryDelay: 30,
      expireInSeconds: 3600, // 1 hour max processing
    });
    return jobId;
  } catch (err: any) {
    console.error("[Queue] Failed to enqueue process-project job:", err);
    throw err;
  }
}
