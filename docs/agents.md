# For AI agents

## Discovery

Two files tell an agent everything it needs:

- [`skill.md`](https://github.com/nirholas/x402-account-link/blob/main/skill.md) — human/agent-readable
  capability sheet: endpoints, prices, schemas, payment details. Served live at `GET /skill.md`.
- `GET /.well-known/x402` — machine-readable manifest (`x402Version`, `resources[]` with
  price, network, asset, and `outputSchema` per route). This is the format indexed by
  [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market).

## Paying — two rails, one 402

**Pay in USDC on Base or Solana — your client picks the rail.** Every paid route answers an
unpaid request with a single `402` whose `accepts` array carries both:

| rail | network | asset | payTo | signs |
|---|---|---|---|---|
| EVM | `base-sepolia` (default) / `base` | USDC (`0x036C…CF7e` on Sepolia) | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | EIP-3009 `transferWithAuthorization` |
| Solana | `solana` (default) / `solana-devnet` | USDC (`EPjF…TDt1v`) | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | SPL `transferChecked` |

Verification and settlement go to the rail's facilitator (`FACILITATOR_URL` for EVM,
`SOLANA_FACILITATOR_URL` for Solana) — the server never holds a key and the Solana lane's
sponsor pays the SOL fee, so a paying agent needs only USDC.

Any x402 client works. With `x402-fetch` on the EVM rail:

```ts
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

import { selectPaymentRequirements } from "x402/client";

// Pin the selector to the EVM entry — a viem wallet can't sign the Solana one.
const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(process.env.PRIVATE_KEY),
  undefined, (reqs) => selectPaymentRequirements(reqs, "base-sepolia", "exact"));
const res = await payFetch(`${BASE}/links/${id}/token?scope=booking:read`);
const { token, expiresAt } = await res.json();       // the artifact, in-response
const receipt = res.headers.get("x-payment-response"); // base64 settlement receipt
```

On the Solana rail, pick `accepts.find(a => a.network.startsWith("solana"))`, build and sign
the SPL transfer to its `payTo` using `extra.feePayer` as fee payer, and send the same base64
`X-PAYMENT` envelope. In a browser, `@three-ws/x402-payment-modal` does the whole Solana flow
against this challenge with no wallet code.

The flow is identical on both rails: request → `402` + requirements → client signs a USDC
payment → retry with `X-PAYMENT` → `200` with the artifact in the body and the receipt
(`{rail, network, transaction, payer}`) in `X-PAYMENT-RESPONSE`.

## What you get back

- `POST /links` ($0.01) → **signed link record + proof**. Keep `linkId` (future mints),
  `credentialFingerprint` (proof of what was vaulted), and `proof.signature` (HMAC over the
  record — verifiable against the vault's `SIGNING_SECRET`).
- `GET /links/:id/token` ($0.002) → **the scoped token itself**, plus its expiry. Present it
  to whatever downstream service trusts this vault; they validate via free `POST /verify-token`.

Nothing is delivered "later" — every payment produces its artifact in the same response.

## MCP integration

See [`examples/mcp-tool.md`](https://github.com/nirholas/x402-account-link/blob/main/examples/mcp-tool.md)
for a minimal MCP server exposing `create_account_link` and `mint_scoped_token` to Claude,
including a `claude_desktop_config.json` snippet. For a full commerce toolbox, use
[x402-mcp-commerce](https://github.com/nirholas/x402-mcp-commerce).

## Listing this service

Operators: to make your deployment discoverable, keep `/.well-known/x402` reachable at your
public origin and submit the URL to x402scan.com, the x402 Bazaar, and agentic.market. The
manifest already carries prices, **both networks**, assets, payTo per rail, and output schemas
in their expected shape.

## Contact

**nichxbt@gmail.com**
