# Raw x402 flow with curl

The x402 protocol is plain HTTP. Here is the 402 → pay → 200 walkthrough against a locally
running vault (`PAY_TO_ADDRESS=0x… npm run dev`).

## 1. Hit a paid route without payment → 402

```bash
curl -i -X POST http://localhost:4036/links \
  -H 'Content-Type: application/json' \
  -d '{"owner":"0x1111111111111111111111111111111111111111","service":"example-airline","scopes":["booking:read"],"credentials":{"username":"u","password":"p"}}'
```

Response:

```
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "Payment required — pay in USDC on Base or Solana; your client picks the rail.",
  "resource": {
    "url": "http://localhost:4036/links",
    "description": "Create an encrypted account link; returns signed link record + proof",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",        // $0.01 in 6-decimal USDC units
      "resource": "http://localhost:4036/links",
      "description": "Create an encrypted account link; returns signed link record + proof",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "10000",
      "amount": "10000",
      "resource": "http://localhost:4036/links",
      "description": "Create an encrypted account link; returns signed link record + proof",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "maxTimeoutSeconds": 60,
      "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4", "name": "USDC", "decimals": 6 }
    }
  ]
}
```

Two entries, two rails. Take whichever your wallet can sign — the server settles that one.

Just want to see the rails? `curl -s -X POST http://localhost:4036/links -H 'content-type: application/json' -d '{}' | jq '.accepts[] | {network, payTo, asset, maxAmountRequired}'`

## 2. Pay

The `X-PAYMENT` header is a base64-encoded payment matching **one** entry of `accepts`:
an EIP-3009 `transferWithAuthorization` signature on the Base entry, or a signed SPL
`transferChecked` transaction on the Solana entry. Signing either by hand is painful —
use any x402 client to produce it:

```bash
PRIVATE_KEY=0x… BASE_URL=http://localhost:4036 npx tsx examples/agent-client.ts
```

(`x402-fetch` intercepts the 402, signs the payment with your wallet, and retries. For the
Solana rail, use a Solana x402 client, or `@three-ws/x402-payment-modal` in a browser — it
reads the same `accepts` array and drives Phantom.)

## 3. Retry with X-PAYMENT → 200

```bash
curl -i -X POST http://localhost:4036/links \
  -H 'Content-Type: application/json' \
  -H "X-PAYMENT: $PAYMENT_B64" \
  -d '{"owner":"0x1111…","service":"example-airline","scopes":["booking:read"],"credentials":{"username":"u","password":"p"}}'
```

The 200/201 response carries the artifact (signed link record + proof) in the body and the
settlement receipt in the `X-PAYMENT-RESPONSE` header — base64 JSON:
`{"success":true,"rail":"evm"|"solana","network":"…","transaction":"…","payer":"…"}`.

## Free routes need no payment

```bash
curl http://localhost:4036/health
curl http://localhost:4036/links/lnk_…            # metadata, no secrets
curl -X POST http://localhost:4036/verify-token \
  -H 'Content-Type: application/json' -d '{"token":"…"}'
```
