import argon2 from "argon2";

/**
 * Hashes a plaintext password using Argon2id with secure defaults conforming to CONTRACT §7 & §3.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch (error) {
    console.error("[Auth] Argon2 verify error:", error);
    return false;
  }
}
