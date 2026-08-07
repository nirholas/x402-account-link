# Raw x402 flow with curl

The x402 protocol is plain HTTP. Here is the 402 → pay → 200 walkthrough against a locally
running vault (`PAY_TO_ADDRESS=0x… npm run dev`).

## 1. Hit a paid route without payment → 402

```bash
curl -i -X POST http://localhost:4021/links \
  -H 'Content-Type: application/json' \
  -d '{"owner":"0x1111111111111111111111111111111111111111","service":"example-airline","scopes":["booking:read"],"credentials":{"username":"u","password":"p"}}'
```

Response:

```
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",        // $0.01 in 6-decimal USDC units
      "resource": "http://localhost:4021/links",
      "description": "Create an encrypted account link; returns signed link record + proof",
      "payTo": "0xYourMerchantWallet",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "maxTimeoutSeconds": 60
    }
  ]
}
```

## 2. Pay

The `X-PAYMENT` header is a base64-encoded, EIP-712-signed USDC authorization matching one
entry of `accepts`. Signing it by hand is painful — use any x402 client to produce it:

```bash
PRIVATE_KEY=0x… BASE_URL=http://localhost:4021 npx tsx examples/agent-client.ts
```

(`x402-fetch` intercepts the 402, signs the payment with your wallet, and retries.)

## 3. Retry with X-PAYMENT → 200

```bash
curl -i -X POST http://localhost:4021/links \
  -H 'Content-Type: application/json' \
  -H "X-PAYMENT: $PAYMENT_B64" \
  -d '{"owner":"0x1111…","service":"example-airline","scopes":["booking:read"],"credentials":{"username":"u","password":"p"}}'
```

The 200/201 response carries the artifact (signed link record + proof) in the body and the
settlement receipt in the `X-PAYMENT-RESPONSE` header (base64 JSON: tx hash, network, payer).

## Free routes need no payment

```bash
curl http://localhost:4021/health
curl http://localhost:4021/links/lnk_…            # metadata, no secrets
curl -X POST http://localhost:4021/verify-token \
  -H 'Content-Type: application/json' -d '{"token":"…"}'
```
