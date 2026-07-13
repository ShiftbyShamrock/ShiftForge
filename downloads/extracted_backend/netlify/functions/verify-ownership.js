// netlify/functions/verify-ownership.js
// Verifies on-chain that a wallet actually owns the NFT before a SHIFT card is forged.
//
// Solana:   nft = mint address.            Checks getTokenAccountsByOwner for that mint with balance >= 1.
// Ethereum: nft = "contract:tokenId".      Calls ERC-721 ownerOf(tokenId) and compares the owner address.
//
// Env vars:
//   SOLANA_RPC_URL  e.g. https://mainnet.helius-rpc.com/?api-key=...  (or any mainnet RPC)
//   ETH_RPC_URL     e.g. https://eth-mainnet.g.alchemy.com/v2/...     (or any mainnet RPC)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function reply(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "RPC error");
  return data.result;
}

async function verifySolana(wallet, mint) {
  if (!process.env.SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL not configured");
  const result = await rpc(process.env.SOLANA_RPC_URL, "getTokenAccountsByOwner", [
    wallet,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  const accounts = (result && result.value) || [];
  for (const acc of accounts) {
    const amt = acc?.account?.data?.parsed?.info?.tokenAmount;
    if (amt && Number(amt.amount) >= 1) return true;
  }
  return false;
}

async function verifyEthereum(wallet, nft) {
  if (!process.env.ETH_RPC_URL) throw new Error("ETH_RPC_URL not configured");
  const [contract, tokenIdRaw] = nft.split(":");
  if (!contract || tokenIdRaw === undefined) {
    throw new Error('Ethereum NFT id must be "contract:tokenId"');
  }
  // ownerOf(uint256) selector = 0x6352211e
  const tokenId = BigInt(tokenIdRaw);
  const data = "0x6352211e" + tokenId.toString(16).padStart(64, "0");
  const result = await rpc(process.env.ETH_RPC_URL, "eth_call", [
    { to: contract, data },
    "latest",
  ]);
  if (!result || result === "0x") return false; // token doesn't exist / not ERC-721
  const owner = "0x" + result.slice(-40);
  return owner.toLowerCase() === wallet.toLowerCase();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid JSON body" });
  }

  const chain = payload.chain === "ethereum" ? "ethereum" : "solana";
  const wallet = String(payload.wallet || "").trim();
  const nft = String(payload.nft || "").trim();
  if (!wallet || !nft) return reply(400, { error: "wallet and nft are required" });

  try {
    const owned = chain === "solana"
      ? await verifySolana(wallet, nft)
      : await verifyEthereum(wallet, nft);

    return reply(200, {
      chain,
      wallet,
      nft,
      owned,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    return reply(502, { error: "Verification failed: " + err.message, owned: false });
  }
};
