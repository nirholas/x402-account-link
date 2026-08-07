import "dotenv/config";
import express from "express";
import { join } from "node:path";
import { paymentMiddleware } from "x402-express";
import {
  VaultError,
  createLink,
  getLink,
  introspectToken,
  mintScopedToken,
  ownerChallenge,
  revokeLink,
} from "./service.js";

const payTo = process.env.PAY_TO_ADDRESS as `0x${string}` | undefined;
if (!payTo || !/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
  console.error(
    "FATAL: PAY_TO_ADDRESS is not set (or is not a 0x address).\n" +
      "Set it to the wallet that should receive x402 payments, e.g.\n" +
      "  PAY_TO_ADDRESS=0xYourWallet npm run dev",
  );
  process.exit(1);
}

const network = (process.env.NETWORK || "base-sepolia") as "base" | "base-sepolia";
const facilitatorUrl = (process.env.FACILITATOR_URL || "https://x402.org/facilitator") as `${string}://${string}`;

const PRICES = {
  "POST /links": "$0.01",
  "GET /links/*/token": "$0.002",
} as const;

const app = express();
app.use(express.json({ limit: "256kb" }));

app.use(
  paymentMiddleware(
    payTo,
    {
      "POST /links": {
        price: PRICES["POST /links"],
        network,
        config: { description: "Create an encrypted account link; returns signed link record + proof" },
      },
      "GET /links/*/token": {
        price: PRICES["GET /links/*/token"],
        network,
        config: { description: "Mint a scoped, expiring access token for a link (owner-wallet auth)" },
      },
    },
    { url: facilitatorUrl },
  ),
);

app.use(express.static(join(process.cwd(), "public"), { dotfiles: "allow" }));

// ---------------------------------------------------------------- free routes

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "x402-account-link", network });
});

// Agent-facing skill file (repo root) served for discovery.
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").sendFile(join(process.cwd(), "skill.md"));
});

// Link metadata (no secrets — the encrypted blob is never returned anywhere).
app.get("/links/:id", (req, res) => {
  try {
    res.json({ link: getLink(req.params.id) });
  } catch (e) {
    handleError(res, e);
  }
});

// The exact message an owner wallet must sign to authorize a token mint.
app.get("/links/:id/challenge", (req, res) => {
  try {
    const link = getLink(req.params.id);
    const scope = String(req.query.scope || link.scopes.join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const timestamp = new Date().toISOString();
    res.json({ linkId: link.linkId, scope, timestamp, message: ownerChallenge(link.linkId, scope, timestamp) });
  } catch (e) {
    handleError(res, e);
  }
});

// Downstream services verify tokens here for free (or use the exported readToken()).
app.post("/verify-token", (req, res) => {
  res.json(introspectToken(String(req.body?.token || "")));
});

// Owner revocation is free — never charge someone to reduce their own exposure.
app.post("/links/:id/revoke", async (req, res) => {
  try {
    const link = await revokeLink(
      req.params.id,
      req.header("X-Owner-Signature") || undefined,
      req.header("X-Owner-Timestamp") || undefined,
    );
    res.json({ revoked: true, link });
  } catch (e) {
    handleError(res, e);
  }
});

// ---------------------------------------------------------------- paid routes

// POST /links ($0.01) — store credentials encrypted, return signed link record + proof.
app.post("/links", (req, res) => {
  try {
    const record = createLink(req.body || {});
    res.status(201).json(record);
  } catch (e) {
    handleError(res, e);
  }
});

// GET /links/:id/token ($0.002) — mint a scoped expiring access token.
app.get("/links/:id/token", async (req, res) => {
  try {
    const token = await mintScopedToken({
      linkId: req.params.id,
      scope: req.query.scope ? String(req.query.scope) : undefined,
      ttlSeconds: req.query.ttlSeconds ? Number(req.query.ttlSeconds) : undefined,
      ownerSignature: req.header("X-Owner-Signature") || undefined,
      timestamp: req.header("X-Owner-Timestamp") || undefined,
    });
    res.json(token);
  } catch (e) {
    handleError(res, e);
  }
});

// -------------------------------------------------------------------- helpers

function handleError(res: express.Response, e: unknown): void {
  if (e instanceof VaultError) {
    res.status(e.status).json({ error: e.code, message: e.message });
    return;
  }
  console.error(e);
  res.status(500).json({ error: "INTERNAL", message: "unexpected error" });
}

const port = Number(process.env.PORT || 4021);
app.listen(port, () => {
  console.log(`x402-account-link vault listening on :${port}`);
  console.log(`  network: ${network}  facilitator: ${facilitatorUrl}`);
  console.log(`  payTo:   ${payTo}`);
  console.log("  paid routes:");
  for (const [route, price] of Object.entries(PRICES)) console.log(`    ${route}  ${price}`);
  console.log("  free routes: GET /health, GET /links/:id, GET /links/:id/challenge, POST /verify-token, POST /links/:id/revoke");
  console.log("  discovery:  GET /.well-known/x402, /skill.md");
});
