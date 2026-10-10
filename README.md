# x402-account-link

> One-time account linking vault for agent flows — encrypted credential links with scoped, expiring access tokens.

![License](https://img.shields.io/badge/license-Apache--2.0-blue) ![x402](https://img.shields.io/badge/payments-x402-0052ff) ![USDC](https://img.shields.io/badge/asset-USDC-2775CA) ![Rails](https://img.shields.io/badge/rails-Base%20%2B%20Solana-9945FF)

**Pay in USDC on Base or Solana — your client picks the rail.**

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
npm run dev                                           # vault on :4036

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

1. Call a paid route → `402 Payment Required` with an `accepts` array listing **both rails**:
   USDC on Base (EVM, EIP-3009) and USDC on Solana (SPL `transferChecked`).
2. Your client picks whichever entry its wallet supports and signs that payment.
3. Retry with the base64 `X-PAYMENT` header; the matching facilitator verifies and settles on-chain.
4. `200` — artifact in the body, settlement receipt (`{rail, network, transaction, payer}`) in `X-PAYMENT-RESPONSE`.

| rail | network (default) | mainnet | payTo | facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` | `NETWORK=base` | `PAY_TO_ADDRESS` | `FACILITATOR_URL` (default `https://x402.org/facilitator`) |
| Solana | `solana` | already mainnet; `SOLANA_NETWORK=devnet` for testing | `SOLANA_PAY_TO_ADDRESS` | `SOLANA_FACILITATOR_URL` (default `https://facilitator.payai.network`) |

Both rails ship with the suite's public receive addresses pre-filled in `.env.example`, so
`npm run dev` works with zero configuration. Set your own addresses to receive the funds.
A rail with an invalid address is simply omitted from `accepts` — the service still runs on the other.

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

## Support

Questions, bugs, integration help: **nichxbt@gmail.com**

## License

[Apache-2.0](LICENSE)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/x402-account-link&type=Date)](https://www.star-history.com/#nirholas/x402-account-link&Date)

<!-- three.ws:growth -->
## Support the project

If x402-account-link saves you time, **[star it on GitHub](https://github.com/nirholas/x402-account-link)**. Stars are how other developers and AI agents find the repositories worth trusting, and they cost you one click.

Know someone who would use it? [Post on X](https://twitter.com/intent/tweet?text=x402-account-link%3A%20One-time%20account%20linking%20vault%20for%20agent%20flows%3A%20encrypted%20credential%20links%20with%20scoped%2C%20expiring&url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-account-link) · [Share on Bluesky](https://bsky.app/intent/compose?text=x402-account-link%3A%20One-time%20account%20linking%20vault%20for%20agent%20flows%3A%20encrypted%20credential%20links%20with%20scoped%2C%20expiring%20https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-account-link) · [Share on LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-account-link) · [Submit to Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-account-link&t=x402-account-link%3A%20One-time%20account%20linking%20vault%20for%20agent%20flows%3A%20encrypted%20credential%20links%20with%20scoped%2C%20expiring) · [Share on Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-account-link&title=x402-account-link%3A%20One-time%20account%20linking%20vault%20for%20agent%20flows%3A%20encrypted%20credential%20links%20with%20scoped%2C%20expiring)

## Built for AI agents too

Coding agents and LLM tooling can read this repo directly: [AGENTS.md](./AGENTS.md), [llms.txt](./llms.txt), [llms-full.txt](./llms-full.txt). Point an agent at `https://github.com/nirholas/x402-account-link` and it has the context it needs.

## More from the same author

- [All repositories by nirholas](https://github.com/nirholas/nirholas#readme): the full catalog, grouped by topic
- [three.ws](https://three.ws): the platform for 3D AI agents with Solana wallets, a skill marketplace and x402 payments
- Questions or ideas: [open an issue](https://github.com/nirholas/x402-account-link/issues) or [start a discussion](https://github.com/nirholas/x402-account-link/discussions)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=nirholas/x402-account-link)](https://github.com/nirholas/x402-account-link/graphs/contributors)

<!-- /three.ws:growth -->
