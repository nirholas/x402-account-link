/**
 * Full x402 payment flow against x402-account-link using x402-fetch.
 *
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4036 npx tsx examples/agent-client.ts
 *
 * The wallet needs testnet USDC on Base Sepolia — faucet: https://faucet.circle.com
 *
 * This service is DUAL-RAIL: every 402 offers USDC on Base *and* USDC on Solana.
 * This example takes the EVM rail (see the Solana note at the bottom of the file).
 */
import { privateKeyToAccount } from "viem/accounts";
import { selectPaymentRequirements } from "x402/client";
import type { PaymentRequirements } from "x402/types";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:4036";
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error("Set PRIVATE_KEY to a funded Base Sepolia wallet (testnet USDC: https://faucet.circle.com)");
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);

// The 402 lists both rails. A viem wallet can only sign the EVM one, so pin the
// selector to the EVM network instead of letting the default picker choose.
const EVM_NETWORK = (process.env.NETWORK || "base-sepolia") as "base" | "base-sepolia";
const payFetch = wrapFetchWithPayment(fetch, account, undefined, (reqs: PaymentRequirements[]) =>
  selectPaymentRequirements(reqs, EVM_NETWORK, "exact"),
);

function receipt(res: Response): string {
  const h = res.headers.get("x-payment-response");
  if (!h) return "(no X-PAYMENT-RESPONSE header)";
  try {
    return JSON.stringify(JSON.parse(Buffer.from(h, "base64").toString("utf8")));
  } catch {
    return h;
  }
}

async function main() {
  console.log(`agent wallet: ${account.address}\n`);

  // 1. Paid: create an encrypted link ($0.01)
  console.log("POST /links  ($0.01) …");
  const createRes = await payFetch(`${BASE_URL}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: account.address,
      service: "example-airline",
      label: "Frequent flyer account",
      scopes: ["booking:read", "booking:write"],
      credentials: { username: "traveler1", password: "correct-horse-battery" },
    }),
  });
  const created = await createRes.json();
  console.log(JSON.stringify(created, null, 2));
  console.log("payment receipt:", receipt(createRes), "\n");

  const linkId = created.link.linkId;

  // 2. Paid: mint a scoped token ($0.002). In production, first sign the
  //    challenge from GET /links/:id/challenge and pass X-Owner-Signature.
  console.log(`GET /links/${linkId}/token?scope=booking:read  ($0.002) …`);
  const tokenRes = await payFetch(`${BASE_URL}/links/${linkId}/token?scope=booking:read&ttlSeconds=600`);
  const token = await tokenRes.json();
  console.log(JSON.stringify(token, null, 2));
  console.log("payment receipt:", receipt(tokenRes), "\n");

  // 3. Free: any downstream service can verify the token.
  const verifyRes = await fetch(`${BASE_URL}/verify-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.token }),
  });
  console.log("POST /verify-token →", JSON.stringify(await verifyRes.json(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/* ─────────────────────────────────────────────────────────────────────────────
 * Paying on the SOLANA rail instead
 *
 * The same 402 also offers `{ scheme: "exact", network: "solana", asset: <USDC
 * mint>, payTo: <base58>, maxAmountRequired, extra: { feePayer } }`. A Solana
 * agent builds an SPL `transferChecked` for that amount to `payTo` with the
 * facilitator's `feePayer` as fee payer (so it needs no SOL), signs it, and
 * retries with the base64 X-PAYMENT envelope:
 *
 *   const challenge = await (await fetch(`${BASE_URL}/links`, { method: "POST", ... })).json();
 *   const accept    = challenge.accepts.find((a) => a.network.startsWith("solana"));
 *   // build + sign the SPL transfer with @solana/web3.js, or let the browser
 *   // modal do it: @three-ws/x402-payment-modal drives Phantom end to end.
 *   const xPayment  = Buffer.from(JSON.stringify({
 *     x402Version: 1, scheme: "exact", network: accept.network,
 *     payload: { transaction: signedTxBase64 },
 *   })).toString("base64");
 *   await fetch(`${BASE_URL}/links`, { method: "POST", headers: { "X-PAYMENT": xPayment, ... } });
 *
 * Raw dual-rail 402 body, for reference:
 *
 *   curl -s -X POST http://localhost:4036/links -H 'content-type: application/json' \
 *     -d '{"owner":"0x1111111111111111111111111111111111111111","service":"demo","credentials":{"k":"v"}}' | jq .accepts
 * ───────────────────────────────────────────────────────────────────────────── */
