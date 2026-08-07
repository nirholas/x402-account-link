# For AI agents

## Discovery

Two files tell an agent everything it needs:

- [`skill.md`](https://github.com/nirholas/x402-account-link/blob/main/skill.md) — human/agent-readable
  capability sheet: endpoints, prices, schemas, payment details. Served live at `GET /skill.md`.
- `GET /.well-known/x402` — machine-readable manifest (`x402Version`, `resources[]` with
  price, network, asset, and `outputSchema` per route). This is the format indexed by
  [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market).

## Paying

Any x402 client works. With `x402-fetch`:

```ts
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(process.env.PRIVATE_KEY));
const res = await payFetch(`${BASE}/links/${id}/token?scope=booking:read`);
const { token, expiresAt } = await res.json();       // the artifact, in-response
const receipt = res.headers.get("x-payment-response"); // base64 settlement receipt
```

The flow is: request → `402` + requirements → client signs USDC authorization →
retry with `X-PAYMENT` → `200` with the artifact in the body.

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
manifest already carries prices, network, asset, and output schemas in their expected shape.
