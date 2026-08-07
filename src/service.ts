import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import { encrypt, fingerprint, type EncryptedBlob } from "./crypto.js";
import { canonicalJson, mintToken, readToken, sign } from "./sign.js";

export interface LinkRecord {
  linkId: string;
  owner: string; // wallet address that created (and controls) the link
  service: string; // e.g. "example-airline", "acme-crm"
  label?: string;
  scopes: string[]; // e.g. ["booking:read", "booking:write"]
  createdAt: string;
  expiresAt: string; // the link itself expires (one-time-linking vault, not forever storage)
  credentialFingerprint: string; // sha256 of canonical credential JSON — proof without disclosure
  revoked: boolean;
}

interface StoredLink extends LinkRecord {
  blob: EncryptedBlob; // AES-256-GCM encrypted credential JSON — never returned by any route
  tokensIssued: number;
}

export interface SignedLinkRecord {
  link: LinkRecord;
  proof: {
    type: "hmac-sha256";
    signedFields: string;
    signature: string;
  };
}

export interface ScopedToken {
  token: string;
  linkId: string;
  service: string;
  scope: string[];
  issuedAt: string;
  expiresAt: string;
  ttlSeconds: number;
}

const DATA_FILE = join(process.cwd(), "data", "links.json");
const DEFAULT_LINK_TTL_S = 30 * 24 * 3600; // 30 days
const MAX_LINK_TTL_S = 365 * 24 * 3600;
const DEFAULT_TOKEN_TTL_S = 15 * 60; // 15 minutes
const MAX_TOKEN_TTL_S = 24 * 3600;

let links: Map<string, StoredLink> | null = null;

function load(): Map<string, StoredLink> {
  if (links) return links;
  links = new Map();
  if (existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoredLink[];
      for (const l of raw) links.set(l.linkId, l);
    } catch {
      // corrupt store — start clean rather than crash the vault
    }
  }
  return links;
}

function persist(): void {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify([...load().values()], null, 2));
}

export class VaultError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createLink(input: {
  owner?: unknown;
  service?: unknown;
  label?: unknown;
  scopes?: unknown;
  credentials?: unknown;
  ttlSeconds?: unknown;
}): SignedLinkRecord {
  const owner = String(input.owner || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new VaultError(400, "INVALID_OWNER", "owner must be a 0x wallet address (it authorizes future token mints)");
  }
  const service = String(input.service || "").trim();
  if (!service || service.length > 100) {
    throw new VaultError(400, "INVALID_SERVICE", "service is required (short identifier of the account being linked)");
  }
  if (input.credentials === undefined || input.credentials === null || typeof input.credentials !== "object") {
    throw new VaultError(400, "INVALID_CREDENTIALS", "credentials must be a JSON object (it is encrypted at rest, never returned)");
  }
  const scopes = Array.isArray(input.scopes) ? input.scopes.map(String).filter(Boolean) : [];
  if (scopes.length === 0) {
    throw new VaultError(400, "INVALID_SCOPES", "scopes must be a non-empty array, e.g. [\"booking:read\"]");
  }
  const ttl = Math.min(Math.max(Number(input.ttlSeconds) || DEFAULT_LINK_TTL_S, 60), MAX_LINK_TTL_S);

  const now = new Date();
  const credentialJson = canonicalJson(input.credentials);
  const record: LinkRecord = {
    linkId: `lnk_${randomUUID()}`,
    owner: owner.toLowerCase(),
    service,
    label: input.label ? String(input.label).slice(0, 200) : undefined,
    scopes,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    credentialFingerprint: fingerprint(credentialJson),
    revoked: false,
  };

  const stored: StoredLink = { ...record, blob: encrypt(credentialJson), tokensIssued: 0 };
  load().set(record.linkId, stored);
  persist();

  return {
    link: record,
    proof: {
      type: "hmac-sha256",
      signedFields: "link (canonical JSON)",
      signature: sign(record),
    },
  };
}

function publicRecord(l: StoredLink): LinkRecord {
  const { blob: _blob, tokensIssued: _t, ...rest } = l;
  return rest;
}

export function getLink(linkId: string): LinkRecord {
  const l = load().get(linkId);
  if (!l) throw new VaultError(404, "LINK_NOT_FOUND", `no link ${linkId}`);
  return publicRecord(l);
}

/** Message the owner wallet must sign to authorize a token mint. */
export function ownerChallenge(linkId: string, scope: string[], timestamp: string): string {
  return `x402-account-link token mint\nlink: ${linkId}\nscope: ${scope.join(",")}\nts: ${timestamp}`;
}

const CHALLENGE_WINDOW_MS = 5 * 60 * 1000;

export async function mintScopedToken(params: {
  linkId: string;
  scope?: string;
  ttlSeconds?: number;
  ownerSignature?: string;
  timestamp?: string;
}): Promise<ScopedToken> {
  const l = load().get(params.linkId);
  if (!l) throw new VaultError(404, "LINK_NOT_FOUND", `no link ${params.linkId}`);
  if (l.revoked) throw new VaultError(410, "LINK_REVOKED", "link has been revoked by its owner");
  if (Date.now() > Date.parse(l.expiresAt)) throw new VaultError(410, "LINK_EXPIRED", "link has expired");

  const scope = (params.scope ? params.scope.split(",").map((s) => s.trim()) : l.scopes).filter(Boolean);
  const invalid = scope.filter((s) => !l.scopes.includes(s));
  if (invalid.length > 0) {
    throw new VaultError(403, "SCOPE_EXCEEDED", `requested scope(s) not granted by link: ${invalid.join(", ")}`);
  }

  // Owner-wallet auth: EIP-191 signature over ownerChallenge(). In dev
  // (ALLOW_UNSIGNED_OWNER=true, the default when unset outside production)
  // the check can be skipped so the demo runs without a wallet signer.
  const allowUnsigned = (process.env.ALLOW_UNSIGNED_OWNER ?? "true") === "true";
  if (params.ownerSignature) {
    const ts = params.timestamp || "";
    if (!ts || Math.abs(Date.now() - Date.parse(ts)) > CHALLENGE_WINDOW_MS) {
      throw new VaultError(401, "STALE_CHALLENGE", "timestamp missing or outside the 5 minute window");
    }
    const ok = await verifyMessage({
      address: l.owner as `0x${string}`,
      message: ownerChallenge(l.linkId, scope, ts),
      signature: params.ownerSignature as `0x${string}`,
    }).catch(() => false);
    if (!ok) throw new VaultError(401, "BAD_OWNER_SIGNATURE", "signature does not recover the link owner wallet");
  } else if (!allowUnsigned) {
    throw new VaultError(401, "OWNER_SIGNATURE_REQUIRED", "provide X-Owner-Signature + X-Owner-Timestamp headers (EIP-191 over the owner challenge)");
  }

  const ttl = Math.min(Math.max(Number(params.ttlSeconds) || DEFAULT_TOKEN_TTL_S, 30), MAX_TOKEN_TTL_S);
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 1000);
  const payload = {
    v: 1,
    typ: "x402-account-link/scoped-token",
    linkId: l.linkId,
    service: l.service,
    scope,
    iat: now.toISOString(),
    exp: expires.toISOString(),
  };
  l.tokensIssued += 1;
  persist();

  return {
    token: mintToken(payload),
    linkId: l.linkId,
    service: l.service,
    scope,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    ttlSeconds: ttl,
  };
}

export interface TokenIntrospection {
  valid: boolean;
  reason?: string;
  linkId?: string;
  service?: string;
  scope?: string[];
  issuedAt?: string;
  expiresAt?: string;
}

export function introspectToken(token: string): TokenIntrospection {
  const payload = readToken(token);
  if (!payload || payload.typ !== "x402-account-link/scoped-token") {
    return { valid: false, reason: "bad signature or malformed token" };
  }
  const linkId = String(payload.linkId);
  const l = load().get(linkId);
  if (!l) return { valid: false, reason: "link no longer exists" };
  if (l.revoked) return { valid: false, reason: "link revoked" };
  if (Date.now() > Date.parse(String(payload.exp))) return { valid: false, reason: "token expired" };
  return {
    valid: true,
    linkId,
    service: String(payload.service),
    scope: (payload.scope as string[]) || [],
    issuedAt: String(payload.iat),
    expiresAt: String(payload.exp),
  };
}

export async function revokeLink(linkId: string, ownerSignature?: string, timestamp?: string): Promise<LinkRecord> {
  const l = load().get(linkId);
  if (!l) throw new VaultError(404, "LINK_NOT_FOUND", `no link ${linkId}`);
  const allowUnsigned = (process.env.ALLOW_UNSIGNED_OWNER ?? "true") === "true";
  if (ownerSignature) {
    const ts = timestamp || "";
    if (!ts || Math.abs(Date.now() - Date.parse(ts)) > CHALLENGE_WINDOW_MS) {
      throw new VaultError(401, "STALE_CHALLENGE", "timestamp missing or outside the 5 minute window");
    }
    const ok = await verifyMessage({
      address: l.owner as `0x${string}`,
      message: `x402-account-link revoke\nlink: ${linkId}\nts: ${ts}`,
      signature: ownerSignature as `0x${string}`,
    }).catch(() => false);
    if (!ok) throw new VaultError(401, "BAD_OWNER_SIGNATURE", "signature does not recover the link owner wallet");
  } else if (!allowUnsigned) {
    throw new VaultError(401, "OWNER_SIGNATURE_REQUIRED", "provide X-Owner-Signature + X-Owner-Timestamp headers");
  }
  l.revoked = true;
  persist();
  return publicRecord(l);
}
