/**
 * Full x402 payment flow against x402-account-link using x402-fetch.
 *
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4021 npx tsx examples/agent-client.ts
 *
 * The wallet needs testnet USDC on Base Sepolia — faucet: https://faucet.circle.com
 */
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:4021";
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error("Set PRIVATE_KEY to a funded Base Sepolia wallet (testnet USDC: https://faucet.circle.com)");
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

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
