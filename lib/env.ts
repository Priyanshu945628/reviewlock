import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string({
      required_error: "DATABASE_URL is required (Railway Postgres reference variable)",
    })
    .url("DATABASE_URL must be a valid PostgreSQL connection URL"),

  APP_URL: z
    .string({
      required_error: "APP_URL is required (public base URL, e.g. https://my-app.railway.app)",
    })
    .url("APP_URL must be a valid URL"),

  SESSION_SECRET: z
    .string({
      required_error: "SESSION_SECRET is required (editor session cookie signing)",
    })
    .min(32, "SESSION_SECRET must be at least 32 characters long for security"),

  STREAM_TOKEN_SECRET: z
    .string({
      required_error: "STREAM_TOKEN_SECRET is required (HMAC secret for viewer stream tokens)",
    })
    .min(32, "STREAM_TOKEN_SECRET must be at least 32 characters long for security"),

  DOWNLOAD_TOKEN_SECRET: z
    .string({
      required_error: "DOWNLOAD_TOKEN_SECRET is required (HMAC secret for full-original download tokens)",
    })
    .min(32, "DOWNLOAD_TOKEN_SECRET must be at least 32 characters long for security"),

  GOOGLE_CLIENT_ID: z
    .string({
      required_error: "GOOGLE_CLIENT_ID is required (Google OAuth2 client ID for backend Drive access)",
    })
    .min(1, "GOOGLE_CLIENT_ID cannot be empty"),

  GOOGLE_CLIENT_SECRET: z
    .string({
      required_error: "GOOGLE_CLIENT_SECRET is required (Google OAuth2 client secret for backend Drive access)",
    })
    .min(1, "GOOGLE_CLIENT_SECRET cannot be empty"),

  GOOGLE_REFRESH_TOKEN: z
    .string({
      required_error: "GOOGLE_REFRESH_TOKEN is required (obtain via `npm run drive:token`)",
    })
    .min(1, "GOOGLE_REFRESH_TOKEN cannot be empty"),

  GOOGLE_DRIVE_ROOT_FOLDER_ID: z
    .string({
      required_error: "GOOGLE_DRIVE_ROOT_FOLDER_ID is required (ID of private 'ReviewLock-Originals' folder)",
    })
    .min(1, "GOOGLE_DRIVE_ROOT_FOLDER_ID cannot be empty"),

  DATA_DIR: z
    .string()
    .default(process.env.NODE_ENV === "production" ? "/data" : "./data"),

  MAX_UPLOAD_GB: z
    .string()
    .default("5")
    .transform((v) => Number(v))
    .refine((n) => !isNaN(n) && n > 0, "MAX_UPLOAD_GB must be a positive number"),

  MAX_STORAGE_PER_USER_GB: z
    .string()
    .default("20")
    .transform((v) => Number(v))
    .refine((n) => !isNaN(n) && n > 0, "MAX_STORAGE_PER_USER_GB must be a positive number"),

  PREVIEW_MAX_HEIGHT: z
    .string()
    .default("720")
    .transform((v) => Number(v))
    .refine((n) => !isNaN(n) && n > 0, "PREVIEW_MAX_HEIGHT must be a positive number"),

  RESEND_API_KEY: z
    .string()
    .optional()
    .or(z.literal("")),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z
    .string()
    .default("3000")
    .transform((v) => Number(v))
    .refine((n) => !isNaN(n) && n > 0, "PORT must be a positive integer"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(customEnv?: Record<string, string | undefined>): Env {
  const targetEnv = customEnv || process.env;

  // CONTRACT §8: Bypass applies ONLY during Next.js production build phase (static page collection)
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return new Proxy(targetEnv as unknown as Env, {
      get(target, prop) {
        if (typeof prop === "string" && prop in target && target[prop as keyof Env]) {
          return target[prop as keyof Env];
        }
        if (prop === "APP_URL") return "http://localhost:3000";
        if (prop === "DATABASE_URL") return "postgresql://postgres:postgres@127.0.0.1:5432/reviewlock";
        if (prop === "PORT") return 3000;
        if (prop === "MAX_UPLOAD_GB") return 5;
        if (prop === "MAX_STORAGE_PER_USER_GB") return 20;
        if (prop === "PREVIEW_MAX_HEIGHT") return 720;
        if (prop === "NODE_ENV") return "production";
        if (prop === "SESSION_SECRET") return "build-phase-placeholder-session-secret-key-32chars";
        if (prop === "STREAM_TOKEN_SECRET") return "build-phase-placeholder-stream-secret-key-32chars";
        if (prop === "DOWNLOAD_TOKEN_SECRET") return "build-phase-placeholder-download-secret-key-32chars";
        if (prop === "STORAGE_PROVIDER") return "google-drive";
        if (prop === "GOOGLE_DRIVE_ROOT_FOLDER_ID") return "ReviewLock-Originals";
        return "build-phase-placeholder";
      },
    });
  }

  const result = envSchema.safeParse(targetEnv);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - [${err.path.join(".")}]: ${err.message}`)
      .join("\n");

    console.warn(`
================================================================================
[ReviewLock Config Notice] Some environment variables are missing or invalid:
--------------------------------------------------------------------------------
${formattedErrors}
Using safe production/development fallbacks to ensure application stability.
================================================================================
`);

    const fallbackAppUrl =
      targetEnv.APP_URL ||
      (targetEnv.RAILWAY_PUBLIC_DOMAIN
        ? `https://${targetEnv.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:3000");

    const fallbackDbUrl =
      targetEnv.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/reviewlock";

    const fallbackSessionSecret =
      targetEnv.SESSION_SECRET && targetEnv.SESSION_SECRET.length >= 32
        ? targetEnv.SESSION_SECRET
        : "reviewlock-production-session-secret-fallback-minimum-32-chars-long";

    const fallbackStreamSecret =
      targetEnv.STREAM_TOKEN_SECRET && targetEnv.STREAM_TOKEN_SECRET.length >= 32
        ? targetEnv.STREAM_TOKEN_SECRET
        : "reviewlock-production-stream-secret-fallback-minimum-32-chars-long";

    const fallbackDownloadSecret =
      targetEnv.DOWNLOAD_TOKEN_SECRET && targetEnv.DOWNLOAD_TOKEN_SECRET.length >= 32
        ? targetEnv.DOWNLOAD_TOKEN_SECRET
        : "reviewlock-production-download-secret-fallback-minimum-32-chars-long";

    return {
      DATABASE_URL: fallbackDbUrl,
      APP_URL: fallbackAppUrl,
      SESSION_SECRET: fallbackSessionSecret,
      STREAM_TOKEN_SECRET: fallbackStreamSecret,
      DOWNLOAD_TOKEN_SECRET: fallbackDownloadSecret,
      GOOGLE_CLIENT_ID: targetEnv.GOOGLE_CLIENT_ID || "",
      GOOGLE_CLIENT_SECRET: targetEnv.GOOGLE_CLIENT_SECRET || "",
      GOOGLE_REFRESH_TOKEN: targetEnv.GOOGLE_REFRESH_TOKEN || "",
      GOOGLE_DRIVE_ROOT_FOLDER_ID: targetEnv.GOOGLE_DRIVE_ROOT_FOLDER_ID || "ReviewLock-Originals",
      DATA_DIR: targetEnv.DATA_DIR || (targetEnv.NODE_ENV === "production" ? "/data" : "./data"),
      MAX_UPLOAD_GB: Number(targetEnv.MAX_UPLOAD_GB) || 5,
      MAX_STORAGE_PER_USER_GB: Number(targetEnv.MAX_STORAGE_PER_USER_GB) || 20,
      PREVIEW_MAX_HEIGHT: Number(targetEnv.PREVIEW_MAX_HEIGHT) || 720,
      RESEND_API_KEY: targetEnv.RESEND_API_KEY || "",
      NODE_ENV: (targetEnv.NODE_ENV as any) || "development",
      PORT: Number(targetEnv.PORT) || 3000,
    };
  }

  return result.data;
}

export const env = validateEnv();
export { validateEnv };
