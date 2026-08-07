# x402-account-link — agent skill

One-time account linking vault for agent flows. An owner stores credentials for a third-party account **once** (encrypted with AES-256-GCM at rest); after that, agents never see the raw credentials — they mint **scoped, expiring access tokens** that downstream services verify. Every paid call returns its artifact in the response body: `POST /links` returns the signed link record + proof, `GET /links/:id/token` returns the minted token itself.

**Base URL**: `{BASE_URL}` (self-hosted — e.g. `http://localhost:4036`)

## Endpoints

### POST /links — $0.01 (paid via x402)
Create an encrypted account link.

Request body (JSON):
```json
{
  "owner": "0xYourWalletAddress",
  "service": "example-airline",
  "label": "Frequent flyer account",
  "scopes": ["booking:read", "booking:write"],
  "credentials": { "username": "traveler1", "password": "s3cret" },
  "ttlSeconds": 2592000
}
```

Response `201`:
```json
{
  "link": {
    "linkId": "lnk_9c2f…",
    "owner": "0xyourwalletaddress",
    "service": "example-airline",
    "label": "Frequent flyer account",
    "scopes": ["booking:read", "booking:write"],
    "createdAt": "2026-08-07T12:00:00.000Z",
    "expiresAt": "2026-09-06T12:00:00.000Z",
    "credentialFingerprint": "sha256-hex-of-canonical-credentials",
    "revoked": false
  },
  "proof": { "type": "hmac-sha256", "signedFields": "link (canonical JSON)", "signature": "…" }
}
```
Credentials are **never** returned by any route; `credentialFingerprint` proves what was stored.

### GET /links/:id/token — $0.002 (paid via x402)
Mint a scoped, expiring access token. Auth: the **owner wallet** signs the challenge from `GET /links/:id/challenge` (EIP-191) and sends it in headers `X-Owner-Signature` + `X-Owner-Timestamp`. (Dev mode `ALLOW_UNSIGNED_OWNER=true`, the default, skips this so demos run without a signer.)

Query params: `scope` (comma-separated subset of link scopes; default all), `ttlSeconds` (30–86400, default 900).

Response `200`:
```json
{
  "token": "eyJ…​.base64url-hmac",
  "linkId": "lnk_9c2f…",
  "service": "example-airline",
  "scope": ["booking:read"],
  "issuedAt": "2026-08-07T12:05:00.000Z",
  "expiresAt": "2026-08-07T12:20:00.000Z",
  "ttlSeconds": 900
}
```

### Free routes
- `GET /links/:id` — link metadata (no secrets).
- `GET /links/:id/challenge?scope=…` — exact message + timestamp the owner wallet must sign.
- `POST /verify-token` `{"token": "…"}` — introspection: `{valid, linkId, service, scope, expiresAt}`.
- `POST /links/:id/revoke` — owner revocation (free by design).
- `GET /health`.

## Payment

x402 protocol (HTTP 402). **Pay in USDC on Base or Solana — your client picks the rail.**

Every paid route answers an unpaid request with one `402` whose `accepts` array lists both rails:

| rail | network | asset | payTo | facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` (default) or `base` | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| Solana | `solana` (default) or `solana-devnet` | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

Flow: call the route → receive `402` with `accepts` → pick the entry your wallet supports → sign the USDC payment (EIP-3009 authorization on EVM, SPL `transferChecked` on Solana) → retry with the base64 `X-PAYMENT` header. The artifact comes back in the `200` body and the settlement receipt (`{rail, network, transaction, payer}`) in the `X-PAYMENT-RESPONSE` header.

Pay with `x402-fetch` + `viem` (EVM), any x402 Solana client, or `@three-ws/x402-payment-modal` in a browser.

Contact: **nichxbt@gmail.com**

## Error codes

| HTTP | code | meaning |
|---|---|---|
| 400 | INVALID_OWNER / INVALID_SERVICE / INVALID_CREDENTIALS / INVALID_SCOPES | malformed create request |
| 401 | OWNER_SIGNATURE_REQUIRED / BAD_OWNER_SIGNATURE / STALE_CHALLENGE | owner-wallet auth failed |
| 402 | (x402) | payment required — pay and retry |
| 403 | SCOPE_EXCEEDED | requested scope not granted by the link |
| 404 | LINK_NOT_FOUND | unknown link id |
| 410 | LINK_REVOKED / LINK_EXPIRED | link no longer mintable |

Machine-readable manifest: [`/.well-known/x402`]({BASE_URL}/.well-known/x402)
