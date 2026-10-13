import crypto from "crypto";

let argon2Module: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  argon2Module = require("argon2");
} catch (err) {
  console.warn(
    "[Auth] Native argon2 addon not loaded, falling back to Node.js crypto.scrypt:",
    err
  );
}

/**
 * Hashes a plaintext password using Argon2id conforming to CONTRACT §7 & §3,
 * or crypto.scrypt if native Argon2 addon is unavailable.
 */
export async function hashPassword(password: string): Promise<string> {
  if (argon2Module) {
    try {
      return await argon2Module.hash(password, {
        type: argon2Module.argon2id,
        memoryCost: 19456, // 19 MiB
        timeCost: 2,
        parallelism: 1,
      });
    } catch (err) {
      console.warn("[Auth] Argon2 hashing failed, falling back to crypto.scrypt:", err);
    }
  }

  // Cryptographic fallback using Node.js built-in scrypt
  return new Promise<string>((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`$scrypt$N=16384,r=8,p=1$${salt.toString("hex")}$${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verifies a plaintext password against an Argon2id or scrypt hash.
 */
export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2") && argon2Module) {
      return await argon2Module.verify(hash, plain);
    }

    if (hash.startsWith("$scrypt$")) {
      const parts = hash.split("$");
      if (parts.length >= 5) {
        const salt = Buffer.from(parts[3], "hex");
        const expectedKey = Buffer.from(parts[4], "hex");
        return new Promise<boolean>((resolve) => {
          crypto.scrypt(plain, salt, expectedKey.length, (err, derivedKey) => {
            if (err) return resolve(false);
            resolve(crypto.timingSafeEqual(derivedKey, expectedKey));
          });
        });
      }
    }

    if (argon2Module) {
      return await argon2Module.verify(hash, plain);
    }

    return false;
  } catch (error) {
    console.error("[Auth] Password verify error:", error);
    return false;
  }
}
