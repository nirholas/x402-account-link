import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM encryption at rest for linked credentials.
 *
 * The vault key is derived (scrypt) from VAULT_KEY, falling back to
 * SIGNING_SECRET, falling back to a dev default. Set VAULT_KEY in production.
 */
const DEV_KEY_MATERIAL = "x402-account-link-dev-vault-key";
const SALT = "x402-account-link-v1";

let cachedKey: Buffer | null = null;
let cachedFrom: string | null = null;

function vaultKey(): Buffer {
  const material = process.env.VAULT_KEY || process.env.SIGNING_SECRET || DEV_KEY_MATERIAL;
  if (!cachedKey || cachedFrom !== material) {
    cachedKey = scryptSync(material, SALT, 32);
    cachedFrom = material;
  }
  return cachedKey;
}

export interface EncryptedBlob {
  alg: "aes-256-gcm";
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

export function encrypt(plaintext: string): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function decrypt(blob: EncryptedBlob): string {
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]);
  return out.toString("utf8");
}

/** SHA-256 fingerprint (hex) — lets a caller prove what was stored without revealing it. */
export function fingerprint(material: string): string {
  return createHash("sha256").update(material).digest("hex");
}
