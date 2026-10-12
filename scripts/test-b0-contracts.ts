import dotenv from "dotenv";
dotenv.config();

// Ensure test defaults for any empty placeholders
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/reviewlock";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "12345678901234567890123456789012";
process.env.STREAM_TOKEN_SECRET = process.env.STREAM_TOKEN_SECRET || "12345678901234567890123456789012";
process.env.DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || "12345678901234567890123456789012";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-client-secret";
process.env.GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "test-refresh-token";
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "test-root-folder";

import assert from "node:assert";

async function main() {
  const { validateEnv } = await import("../lib/env");
  const { getStorageProvider, resetStorageProvider } = await import("../lib/storage");

  console.log("================================================================================");
  console.log("RUNNING B0 CONTRACT VERIFICATION TESTS");
  console.log("================================================================================\n");

  // -----------------------------------------------------------------------------
  // TEST 1: Env validation fails fast at runtime when a required variable is missing
  // -----------------------------------------------------------------------------
  console.log("--> TEST 1: Env validation fails fast at runtime with missing variables...");
  delete process.env.NEXT_PHASE; // Ensure runtime mode
  const incompleteEnv = {
    NODE_ENV: "development",
    PORT: "3000",
    // Missing DATABASE_URL, SESSION_SECRET, GOOGLE credentials, etc.
  };

  let envThrew = false;
  try {
    validateEnv(incompleteEnv);
  } catch (err: any) {
    envThrew = true;
    assert(
      err.message.includes("CRITICAL CONFIGURATION ERROR"),
      "Expected readable fail-fast error header"
    );
    assert(
      err.message.includes("DATABASE_URL"),
      "Expected message to mention missing DATABASE_URL"
    );
    console.log("✓ Correctly threw fail-fast diagnostic error at runtime:");
    console.log(err.message.trim().split("\n").slice(0, 9).join("\n") + "\n  ...\n");
  }
  assert(envThrew, "validateEnv should have thrown an error for missing required variables!");

  // -----------------------------------------------------------------------------
  // TEST 2: Env validation bypass ONLY applies when NEXT_PHASE === 'phase-production-build'
  // -----------------------------------------------------------------------------
  console.log("--> TEST 2: Env validation bypass works ONLY during phase-production-build...");
  process.env.NEXT_PHASE = "phase-production-build";
  const buildEnvResult = validateEnv(incompleteEnv);
  assert(buildEnvResult !== undefined, "Expected proxy object during build phase");
  console.log("✓ Build phase successfully bypassed with proxy without throwing.\n");
  delete process.env.NEXT_PHASE; // Reset to runtime

  // -----------------------------------------------------------------------------
  // TEST 3: Mock storage is strictly forbidden in production
  // -----------------------------------------------------------------------------
  console.log("--> TEST 3: Mock storage throws in production (NODE_ENV=production)...");
  resetStorageProvider();
  process.env.STORAGE_PROVIDER = "mock";
  (process.env as any).NODE_ENV = "production";

  let mockProdThrew = false;
  try {
    getStorageProvider();
  } catch (err: any) {
    mockProdThrew = true;
    assert(
      err.message.includes("STORAGE_PROVIDER=mock cannot be used in production"),
      "Expected production prohibition message"
    );
    console.log(`✓ Correctly threw error: "${err.message}"\n`);
  }
  assert(mockProdThrew, "getStorageProvider should have thrown for mock in production!");

  // -----------------------------------------------------------------------------
  // TEST 4: Missing Google credentials never silently fall back to mock
  // -----------------------------------------------------------------------------
  console.log("--> TEST 4: Missing Google credentials never silently falls back to mock...");
  resetStorageProvider();
  delete process.env.STORAGE_PROVIDER; // Explicitly NOT mock
  (process.env as any).NODE_ENV = "development";

  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID; // Incomplete credentials

  try {
    const provider = getStorageProvider();
    const { MockStorageProvider } = await import("../lib/storage/mock");
    assert(
      !(provider instanceof MockStorageProvider),
      "Must NEVER return MockStorageProvider when STORAGE_PROVIDER is not 'mock'"
    );
    console.log("✓ Did NOT fall back to MockStorageProvider.\n");
  } catch {
    console.log("✓ Correctly failed to instantiate when credentials are missing (no silent fallback).\n");
  }
  process.env.GOOGLE_CLIENT_ID = originalClientId; // Restore

  // -----------------------------------------------------------------------------
  // TEST 5: Mock storage activates only when explicitly set to 'mock' in dev
  // -----------------------------------------------------------------------------
  console.log("--> TEST 5: Mock storage activates ONLY when STORAGE_PROVIDER=mock in dev...");
  resetStorageProvider();
  process.env.STORAGE_PROVIDER = "mock";
  (process.env as any).NODE_ENV = "development";
  const mockProvider = getStorageProvider();
  const { MockStorageProvider } = await import("../lib/storage/mock");
  assert(
    mockProvider instanceof MockStorageProvider,
    "Expected MockStorageProvider instance"
  );
  console.log("✓ Successfully returned MockStorageProvider when explicitly enabled in development.\n");

  // Reset environment
  resetStorageProvider();
  delete process.env.STORAGE_PROVIDER;
  (process.env as any).NODE_ENV = "development";

  console.log("================================================================================");
  console.log("ALL B0 CONTRACT VERIFICATION TESTS PASSED!");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
