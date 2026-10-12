import dotenv from "dotenv";
dotenv.config();

import { startWorker } from "../lib/queue/worker";

async function main() {
  console.log("================================================================================");
  console.log("ReviewLock Background Video Processing Worker (CHUNK B3)");
  console.log("================================================================================");

  try {
    await startWorker();
    console.log("Worker is running. Press Ctrl+C to terminate.");
  } catch (err: any) {
    console.error("Worker failed to start:", err);
    process.exit(1);
  }
}

main();
