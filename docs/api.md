# API reference

Base URL: your deployment (default `http://localhost:4036`). Paid routes speak x402:
an unpaid request returns `402` with `PaymentRequirements` listing **both** payment rails
(USDC on Base and USDC on Solana); pay either and retry with `X-PAYMENT`.
Full machine-readable spec: [`openapi.json`](https://github.com/nirholas/x402-account-link/blob/main/openapi.json).

## POST /links — $0.01

Create an encrypted account link. Credentials are AES-256-GCM encrypted at rest and never
returned by any route.

**Body**

| field | type | required | notes |
|---|---|---|---|
| `owner` | string | yes | `0x` wallet address that controls the link |
| `service` | string | yes | identifier of the linked account's service |
| `label` | string | no | human label, ≤200 chars |
| `scopes` | string[] | yes | e.g. `["booking:read","booking:write"]` |
| `credentials` | object | yes | encrypted at rest, never returned |
| `ttlSeconds` | number | no | link lifetime, 60s–1y, default 30 days |

**201 response**

```json
{
  "link": {
    "linkId": "lnk_9c2f4a10-…",
    "owner": "0x1111…",
    "service": "example-airline",
    "label": "Frequent flyer account",
    "scopes": ["booking:read", "booking:write"],
    "createdAt": "2026-08-07T12:00:00.000Z",
    "expiresAt": "2026-09-06T12:00:00.000Z",
    "credentialFingerprint": "3f9a…",
    "revoked": false
  },
  "proof": { "type": "hmac-sha256", "signedFields": "link (canonical JSON)", "signature": "ab41…" }
}
```

**Errors**: `400 INVALID_OWNER | INVALID_SERVICE | INVALID_CREDENTIALS | INVALID_SCOPES`, `402`.

## GET /links/:id/token — $0.002

Mint a scoped, expiring access token.

**Query**: `scope` (comma-separated subset of link scopes, default all), `ttlSeconds` (30–86400, default 900).
**Headers** (production): `X-Owner-Signature` (EIP-191 over the challenge), `X-Owner-Timestamp`.

**200 response**

```json
{
  "token": "eyJsaW5rSWQiOi…​.mE4…",
  "linkId": "lnk_9c2f4a10-…",
  "service": "example-airline",
  "scope": ["booking:read"],
  "issuedAt": "2026-08-07T12:05:00.000Z",
  "expiresAt": "2026-08-07T12:20:00.000Z",
  "ttlSeconds": 900
}
```

**Errors**: `401 OWNER_SIGNATURE_REQUIRED | BAD_OWNER_SIGNATURE | STALE_CHALLENGE`,
`402`, `403 SCOPE_EXCEEDED`, `404 LINK_NOT_FOUND`, `410 LINK_REVOKED | LINK_EXPIRED`.

## GET /links/:id — free

Link metadata (no secrets). `200 → { "link": { …LinkRecord } }`, `404` if unknown.

## GET /links/:id/challenge — free

Returns `{ linkId, scope, timestamp, message }` — the exact EIP-191 message the owner wallet
signs to authorize a mint. The timestamp is valid for 5 minutes.

## POST /verify-token — free

Body `{ "token": "…" }` → `{ valid, reason?, linkId?, service?, scope?, issuedAt?, expiresAt? }`.
Checks HMAC signature, expiry, link existence, and revocation.

## POST /links/:id/revoke — free

Owner revocation (headers `X-Owner-Signature` over `x402-account-link revoke\nlink: <id>\nts: <ts>`
+ `X-Owner-Timestamp` when `ALLOW_UNSIGNED_OWNER=false`). `200 → { revoked: true, link }`.

## GET /health — free

`{ ok: true, service: "x402-account-link", rails: ["base", "solana"] }`.

## 402 shape (all paid routes)

Dual-rail: `accepts` always lists **both** USDC on Base and USDC on Solana. Pay either one.

```json
{
  "x402Version": 1,
  "error": "Payment required — pay in USDC on Base or Solana; your client picks the rail.",
  "resource": { "url": "http://localhost:4036/links", "description": "…", "mimeType": "application/json" },
  "accepts": [
    {
      "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "10000",
      "resource": "http://localhost:4036/links",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "maxTimeoutSeconds": 60, "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact", "network": "solana", "maxAmountRequired": "10000", "amount": "10000",
      "resource": "http://localhost:4036/links",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "maxTimeoutSeconds": 60,
      "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4", "name": "USDC", "decimals": 6 }
    }
  ]
}
```

On success the `200` carries the artifact in the body and the receipt in `X-PAYMENT-RESPONSE`
(base64 JSON: `{success, rail, network, transaction, payer}`).
