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

function validateEnv(): Env {
  // Allow skipping during next build or container build phase so builds succeed before runtime secrets are attached
  const isBuildPhase =
    process.env.npm_lifecycle_event === "build" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.SKIP_ENV_VALIDATION === "true";

  if (isBuildPhase) {
    return new Proxy(process.env as unknown as Env, {
      get(target, prop) {
        if (typeof prop === "string" && prop in target) {
          return target[prop as keyof Env];
        }
        return "placeholder-build-value";
      },
    });
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - [${err.path.join(".")}]: ${err.message}`)
      .join("\n");

    const errorMessage = `
================================================================================
CRITICAL CONFIGURATION ERROR: Invalid or Missing Environment Variables
--------------------------------------------------------------------------------
The application failed to boot because one or more required environment
variables specified in CONTRACT §8 are missing or invalid:

${formattedErrors}

Please check your .env or Railway Variables configuration against .env.example.
================================================================================
`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data;
}

export const env = validateEnv();
export { validateEnv };
