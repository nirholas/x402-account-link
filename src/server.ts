import "dotenv/config";
import express from "express";
import { join } from "node:path";
import { paywall, railSummary, type RoutePrices } from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import {
  VaultError,
  createLink,
  getLink,
  introspectToken,
  mintScopedToken,
  ownerChallenge,
  revokeLink,
} from "./service.js";

// Paid routes. `*` stands in for a path parameter. Free routes are absent here.
const PRICES: RoutePrices = {
  "POST /links": {
    price: "$0.01",
    description: "Create an encrypted account link; returns signed link record + proof",
    ...ROUTE_SCHEMAS["POST /links"],
  },
  "GET /links/*/token": {
    price: "$0.002",
    description: "Mint a scoped, expiring access token for a link (owner-wallet auth)",
    ...ROUTE_SCHEMAS["GET /links/*/token"],
  },
};

const app = express();
app.use(express.json({ limit: "256kb" }));

// Dual-rail x402: every paid route offers USDC on Base *and* USDC on Solana.
app.use(paywall(PRICES));

app.use(express.static(join(process.cwd(), "public"), { dotfiles: "allow" }));

// ---------------------------------------------------------------- free routes

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "x402-account-link", rails: ["base", "solana"] });
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

const port = Number(process.env.PORT || 4036);
app.listen(port, () => {
  console.log(`x402-account-link vault listening on :${port}`);
  for (const line of railSummary()) console.log(line);
  console.log("  paid routes:");
  for (const [route, cfg] of Object.entries(PRICES)) console.log(`    ${route}  ${cfg.price}`);
  console.log("  free routes: GET /health, GET /links/:id, GET /links/:id/challenge, POST /verify-token, POST /links/:id/revoke");
  console.log("  discovery:  GET /.well-known/x402, /skill.md");
});
