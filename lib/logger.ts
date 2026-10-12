// lib/logger.ts
// Redacting logger conforming to CONTRACT §2, §6 & CHUNKS B7 (Hardening)
// Strictly ensures tokens, passcodes, hashes, session cookies, and Google Drive IDs are never logged in cleartext.

const REDACTION_PATTERNS = [
  // Google OAuth Refresh tokens (e.g. 1//0gLdm...)
  {
    regex: /1\/\/[a-zA-Z0-9_.-]{20,}/g,
    replacement: "[REDACTED_GOOGLE_REFRESH_TOKEN]",
  },
  // Signed streaming/download tokens (format: raw.exp.sig)
  {
    regex: /[a-zA-Z0-9_-]{20,}\.\d+\.[a-zA-Z0-9_-]{20,}/g,
    replacement: "[REDACTED_SIGNED_TOKEN]",
  },
  // Argon2id password hashes
  {
    regex: /\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[a-zA-Z0-9+/=]+\$[a-zA-Z0-9+/=]+/g,
    replacement: "[REDACTED_ARGON2_HASH]",
  },
  // Session cookies
  {
    regex: /rl_sess=[a-zA-Z0-9_-]+/g,
    replacement: "rl_sess=[REDACTED_SESSION_COOKIE]",
  },
  // Authorization headers
  {
    regex: /Bearer\s+[a-zA-Z0-9_.-]+/gi,
    replacement: "Bearer [REDACTED_BEARER_TOKEN]",
  },
  // Raw password fields in JSON strings or queries
  {
    regex: /"password":\s*"[^"]+"/g,
    replacement: '"password": "[REDACTED_PASSWORD]"',
  },
  {
    regex: /"passcode":\s*"[^"]+"/g,
    replacement: '"passcode": "[REDACTED_PASSCODE]"',
  },
  // Google Drive File ID (28-44 character base64url/alphanumeric strings in drive API URLs or file params)
  {
    regex: /(files\/|fileId[=:]\s*["']?)([a-zA-Z0-9_-]{25,44})(["']?)/g,
    replacement: "$1[REDACTED_DRIVE_ID]$3",
  },
];

export function redact(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") {
    let result = input;
    for (const { regex, replacement } of REDACTION_PATTERNS) {
      result = result.replace(regex, replacement);
    }
    return result;
  }
  if (input instanceof Error) {
    const clonedError = new Error(redact(input.message));
    if (input.stack) {
      clonedError.stack = redact(input.stack);
    }
    return clonedError;
  }
  if (Array.isArray(input)) {
    return input.map(redact);
  }
  if (typeof input === "object") {
    const copy: Record<string, any> = {};
    for (const [key, val] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("passcode") ||
        lowerKey === "authorization" ||
        lowerKey === "cookie"
      ) {
        copy[key] = "[REDACTED_SENSITIVE_KEY]";
      } else {
        copy[key] = redact(val);
      }
    }
    return copy;
  }
  return input;
}

export const logger = {
  log(...args: any[]) {
    console.log(...args.map(redact));
  },
  info(...args: any[]) {
    console.info(...args.map(redact));
  },
  warn(...args: any[]) {
    console.warn(...args.map(redact));
  },
  error(...args: any[]) {
    console.error(...args.map(redact));
  },
};
