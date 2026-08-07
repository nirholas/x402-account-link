# x402-account-link

> One-time account linking vault for agent flows — encrypted credential links with scoped, expiring access tokens.

![License](https://img.shields.io/badge/license-Apache--2.0-blue) ![x402](https://img.shields.io/badge/payments-x402-0052ff) ![USDC](https://img.shields.io/badge/asset-USDC%20on%20Base-2775CA)

Agents constantly hit the "log in to your account" wall. The safe answer is not handing your
password to every agent: it's linking the account **once** into a vault (AES-256-GCM at rest)
and letting agents mint **scoped, expiring tokens** from it — each mint a tiny x402 payment,
each artifact returned in the response body.

## Why x402 for this

Credential vaults normally mean accounts, API keys, and a billing relationship — exactly the
onboarding friction agents can't handle. With x402, an agent pays $0.002 in USDC per token
mint over plain HTTP: no signup, no key distribution, and the vault operator gets paid per
use instead of running a free service.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-account-link
cd x402-account-link && npm install
PAY_TO_ADDRESS=0xYourMerchantWallet npm run dev       # vault on :4021

# agent side (Base Sepolia USDC — faucet: https://faucet.circle.com)
PRIVATE_KEY=0xAgentWallet npm run client
```

## API

| Route | Price | What you get back |
|---|---|---|
| `POST /links` | **$0.01** | Signed link record + HMAC proof (`linkId`, scopes, expiry, `credentialFingerprint`). Credentials are never returned by any route. |
| `GET /links/:id/token` | **$0.002** | Scoped, expiring access token — the instrument itself, in-response. |
| `GET /links/:id` | free | Link metadata, no secrets. |
| `GET /links/:id/challenge` | free | EIP-191 message the owner wallet signs to authorize a mint. |
| `POST /verify-token` | free | Token introspection for downstream services. |
| `POST /links/:id/revoke` | free | Owner revocation — reducing your exposure is never paywalled. |

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json)

## How x402 works

1. Call a paid route → `402 Payment Required` with an `accepts` array (exact USDC amount, network, `payTo`).
2. Your client (`x402-fetch`, or any x402 client) signs the payment authorization.
3. Retry with the `X-PAYMENT` header; the facilitator verifies and settles on-chain.
4. `200` — artifact in the body, settlement receipt in `X-PAYMENT-RESPONSE`.

Testnet by default (`base-sepolia` + `https://x402.org/facilitator`). Mainnet: `NETWORK=base` + your `FACILITATOR_URL`.

## Real backend / keys

Fully self-contained — no third-party APIs, no paid keys, nothing fixture-labeled. What the
envs unlock is **security**, not data:

- `SIGNING_SECRET` — HMAC key for signed records/tokens (insecure dev default otherwise).
- `VAULT_KEY` — AES-256-GCM key material for credentials at rest (falls back to `SIGNING_SECRET`).
- `ALLOW_UNSIGNED_OWNER=false` — require real EIP-191 owner signatures on mints (dev default: `true`).

## For AI agents

- [`skill.md`](skill.md) — agent-facing capability sheet, served at `GET /skill.md`.
- `GET /.well-known/x402` — machine-readable manifest ([source](public/.well-known/x402)) in the
  format indexed by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market).
- MCP: [`examples/mcp-tool.md`](examples/mcp-tool.md) wraps the vault as Claude tools
  (`create_account_link`, `mint_scoped_token`) with a `claude_desktop_config.json` example.
- Guide: [docs/agents.md](docs/agents.md).

## Docs

Site: **https://nirholas.github.io/x402-account-link/** — [tutorial](docs/tutorial.md) · [API](docs/api.md) · [agents](docs/agents.md) · [curl walkthrough](examples/curl.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## License

[Apache-2.0](LICENSE)
