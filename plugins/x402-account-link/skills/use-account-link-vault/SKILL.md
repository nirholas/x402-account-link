---
name: use-account-link-vault
description: Run and call the x402 account-link vault, which stores third-party credentials once and mints scoped, expiring access tokens over HTTP with x402 USDC payments. Use when an agent flow needs delegated account access without ever handling raw credentials.
---

# Use the x402 account-link vault

An owner stores credentials for a third-party account once (AES-256-GCM at rest). Agents then mint
scoped, expiring tokens; credentials are never returned by any route. Paid routes use x402 (HTTP 402,
USDC on Base or Solana).

Paying is irreversible. Before any paid call, show the user the route, price, network and payTo
address from the 402 response, and wait for an explicit yes.

## Run the vault

Self-hosted, from a clone (Node 18+):

```bash
git clone https://github.com/nirholas/x402-account-link
cd x402-account-link && npm install
npm run dev        # tsx src/server.ts, listens on :4036 (PORT overrides)
```

Environment: `SIGNING_SECRET` (HMAC key for records and tokens), `VAULT_KEY` (AES-256-GCM key
material, falls back to `SIGNING_SECRET`), `ALLOW_UNSIGNED_OWNER=false` to require real EIP-191 owner
signatures (default `true` for demos), `PAY_TO_ADDRESS` and `NETWORK` (`base-sepolia` default, or
`base`), `SOLANA_PAY_TO_ADDRESS` and `SOLANA_NETWORK`, `FACILITATOR_URL`, `SOLANA_FACILITATOR_URL`.
Set your own secrets and addresses for anything beyond a local demo. `npm run build` then
`npm start` runs the compiled server.

## Routes

| Route | Price | Result |
|---|---|---|
| `POST /links` | $0.01 | Signed link record plus HMAC proof (`linkId`, scopes, expiry, `credentialFingerprint`) |
| `GET /links/:id/token` | $0.002 | Scoped, expiring access token |
| `GET /links/:id` | free | Link metadata, no secrets |
| `GET /links/:id/challenge` | free | EIP-191 message the owner wallet signs |
| `POST /verify-token` | free | Token introspection: `{valid, linkId, service, scope, expiresAt}` |
| `POST /links/:id/revoke` | free | Owner revocation |
| `GET /health`, `GET /skill.md` | free | Health and the repo's capability sheet |

Create body: `owner`, `service`, `label`, `scopes` (array), `credentials` (object), `ttlSeconds`.
Token query params: `scope` (comma-separated subset of the link's scopes) and `ttlSeconds`
(30 to 86400, default 900). With `ALLOW_UNSIGNED_OWNER=false`, send `X-Owner-Signature` and
`X-Owner-Timestamp` from signing the `/challenge` message.

## Paying

An unpaid request to a paid route returns 402 with an `accepts` array listing both rails. Sign the
entry your wallet supports and retry with the base64 `X-PAYMENT` header. The receipt comes back in
`X-PAYMENT-RESPONSE`. The repo's reference client (`npm run client`, `examples/agent-client.ts`)
uses `x402-fetch` with `PRIVATE_KEY` for a Base Sepolia wallet and `BASE_URL`.

## Example

```bash
curl -i -X POST localhost:4036/links -H 'content-type: application/json' \
  -d '{"owner":"0xYourWallet","service":"example-airline","scopes":["booking:read"],"credentials":{"username":"u","password":"p"},"ttlSeconds":2592000}'
# 402 with accepts[]: confirm with the user, then pay and retry
curl -s localhost:4036/verify-token -H 'content-type: application/json' -d '{"token":"<token>"}'
```
