# Exposing x402-account-link as an MCP tool for Claude

Model Context Protocol (MCP) lets Claude call this vault as a tool. The pattern below wraps
the two paid routes with `x402-fetch`, so every tool call pays per use — no API keys.

> Ready-made alternative: [x402-mcp-commerce](https://github.com/nirholas/x402-mcp-commerce)
> is a full MCP server for the whole x402 suite; this page shows the minimal DIY version.

## Minimal MCP server (stdio)

```ts
// mcp-account-link.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.ACCOUNT_LINK_URL || "http://localhost:4036";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

const server = new McpServer({ name: "x402-account-link", version: "0.1.0" });

server.tool(
  "create_account_link",
  "Store credentials for a third-party account in an encrypted vault ($0.01, x402). Returns a signed link record — credentials are never readable again.",
  {
    owner: z.string().describe("0x wallet address that controls the link"),
    service: z.string(),
    scopes: z.array(z.string()),
    credentials: z.record(z.string()),
  },
  async (args) => {
    const res = await payFetch(`${BASE_URL}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

server.tool(
  "mint_scoped_token",
  "Mint a scoped, expiring access token from an account link ($0.002, x402).",
  { linkId: z.string(), scope: z.string().optional(), ttlSeconds: z.number().optional() },
  async ({ linkId, scope, ttlSeconds }) => {
    const q = new URLSearchParams();
    if (scope) q.set("scope", scope);
    if (ttlSeconds) q.set("ttlSeconds", String(ttlSeconds));
    const res = await payFetch(`${BASE_URL}/links/${linkId}/token?${q}`);
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

await server.connect(new StdioServerTransport());
```

## Claude Desktop config

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-account-link": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-account-link.ts"],
      "env": {
        "ACCOUNT_LINK_URL": "http://localhost:4036",
        "PRIVATE_KEY": "0x…funded Base Sepolia wallet…"
      }
    }
  }
}
```

Claude can now link accounts and mint tokens mid-conversation, paying per call in USDC.
Discovery for agents that browse: `GET /.well-known/x402` and `GET /skill.md` on the vault.
