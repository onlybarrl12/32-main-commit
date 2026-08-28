import crypto from "node:crypto";

// Reversible password storage for the admin "download current passwords"
// feature (2026-08-25, User.passwordEncrypted) — a deliberate, explicit
// tradeoff the user chose over one-time-reveal-only (see
// MAIN_SHEET_REWORK_PLAN.md). This is separate from and in addition to
// bcrypt's passwordHash, which stays the one actually checked at login —
// this module is never used for authentication, only for admin recovery.
//
// AES-256-GCM with a server-side key (PASSWORD_RECOVERY_KEY, 64 hex chars
// = 32 bytes) — not plaintext-in-the-database, but anyone with both DB
// access AND this env var can still recover every password, which is the
// accepted tradeoff here. Rotating PASSWORD_RECOVERY_KEY invalidates every
// previously-encrypted password (they'll show as unrecoverable until reset).

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.PASSWORD_RECOVERY_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "PASSWORD_RECOVERY_KEY is missing or not 64 hex characters (32 bytes) — set it in .env. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

/** plaintext -> "iv:authTag:ciphertext", all hex, colon-joined. */
export function encryptPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Reverses encryptPassword. Returns null (rather than throwing) on any malformed/undecryptable input, so a caller can just skip that row. */
export function decryptPassword(encrypted: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = encrypted.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

/** Random password for bulk-create/reset — 12 chars, mixed case + digits + one symbol, avoids visually-ambiguous characters (0/O, 1/l/I). */
export function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = letters + digits;
  let pw = "";
  for (let i = 0; i < 10; i++) pw += all[crypto.randomInt(all.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += symbols[crypto.randomInt(symbols.length)];
  return pw;
}
