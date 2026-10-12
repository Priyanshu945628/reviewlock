// Worker placeholder for B0 scaffold. Full pg-boss + FFmpeg processing worker is built in B3.
console.log("[Worker] ReviewLock background worker process initialized");

// Handle termination signals cleanly
process.on("SIGTERM", () => {
  console.log("[Worker] SIGTERM received, exiting...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Worker] SIGINT received, exiting...");
  process.exit(0);
});

// Keep event loop active
setInterval(() => {}, 1000 * 60 * 60);
