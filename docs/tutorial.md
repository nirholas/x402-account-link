# Tutorial — from clone to minted token

This walkthrough takes you from install to a paid, scoped access token on Base Sepolia testnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-account-link
cd x402-account-link
npm install
```

## 2. Environment

```bash
cp .env.example .env
```

Minimum required:

```ini
PAY_TO_ADDRESS=0x40252CFDF8B20Ed757D61ff157719F33Ec332402        # EVM (Base) receive address
SOLANA_PAY_TO_ADDRESS=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW  # Solana receive address
```

Recommended for anything beyond a local demo:

```ini
SIGNING_SECRET=a-long-random-string   # HMAC key for signed records + tokens
VAULT_KEY=another-long-random-string  # AES-256-GCM key material for credentials at rest
ALLOW_UNSIGNED_OWNER=false            # require EIP-191 owner signatures on token mints
```

## 3. Run the server

```bash
npm run dev
```

You should see the startup banner listing both paid routes (`POST /links` $0.01,
`GET /links/:id/token` $0.002) on port 4021.

## 4. Your first 402

```bash
curl -i -X POST http://localhost:4021/links \
  -H 'Content-Type: application/json' \
  -d '{"owner":"0x1111111111111111111111111111111111111111","service":"demo","scopes":["read"],"credentials":{"user":"u","pass":"p"}}'
```

You get `402 Payment Required` with an `accepts` array holding **two** entries — USDC on
Base and USDC on Solana — each describing exactly what to pay (amount in atomic units,
network, asset address, payTo). That JSON *is* the x402 protocol. Your client picks the rail
its wallet supports; the server settles whichever one comes back in `X-PAYMENT`.

## 5. A paid call with the example client

Fund a throwaway wallet with Base Sepolia USDC (https://faucet.circle.com), then:

```bash
PRIVATE_KEY=0xAgentWallet BASE_URL=http://localhost:4021 npm run client
```

The client:

1. `POST /links` — pays $0.01, prints the **signed link record + proof**.
2. `GET /links/:id/token?scope=booking:read` — pays $0.002, prints the **minted token**.
3. `POST /verify-token` — free introspection showing the token is valid and scoped.

Each paid response also prints the decoded `X-PAYMENT-RESPONSE` settlement receipt
(transaction hash, network, payer).

## 6. Reading the artifact

`POST /links` returns:

- `link.credentialFingerprint` — SHA-256 of the canonical credential JSON. Store it: it
  proves later exactly what was vaulted, without the vault ever revealing the secret.
- `proof.signature` — HMAC-SHA256 over the canonical `link` object. Verify with
  `verify()` from `src/sign.ts` or by recomputing with your `SIGNING_SECRET`.

`GET /links/:id/token` returns `token` — a compact `base64url(payload).base64url(hmac)`
instrument. Downstream services validate it with `POST /verify-token` (free) or offline
with `readToken()` from `src/sign.ts`.

## 7. Owner-wallet auth (production)

With `ALLOW_UNSIGNED_OWNER=false`, minting requires the link owner's signature:

```bash
curl http://localhost:4021/links/$LINK_ID/challenge?scope=booking:read
# → { message, timestamp }   sign `message` with the owner wallet (EIP-191)
curl "http://localhost:4021/links/$LINK_ID/token?scope=booking:read" \
  -H "X-Owner-Signature: 0x…" -H "X-Owner-Timestamp: <timestamp>"
```

## 8. Going to mainnet

```ini
NETWORK=base
FACILITATOR_URL=https://your-mainnet-facilitator.example
```

Payments switch to real USDC on Base mainnet. Set strong `SIGNING_SECRET` and `VAULT_KEY`,
turn off `ALLOW_UNSIGNED_OWNER`, and put the vault behind TLS — it stores credentials.
