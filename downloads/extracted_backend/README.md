# SHIFT Forge — Backend

Three serverless functions that power the SHIFT Forge in production:

| Endpoint | Purpose |
|---|---|
| `POST /api/forge-analyze` | Proxies NFT analysis to the Anthropic API (key stays server-side) |
| `POST /api/generate-art` | Proxies art generation to DALL·E 3 or Stability AI (keys stay server-side) |
| `POST /api/verify-ownership` | Verifies on-chain that the wallet owns the NFT (Solana + Ethereum) |

## Deploy (Netlify — free tier is fine)

1. Create a free account at netlify.com.
2. Put this folder in a GitHub repo (or drag-and-drop deploy from the Netlify UI).
3. Create a `public/` folder and drop `shift-forge-v6.html` in it as `index.html` — Netlify then hosts the frontend and backend together on one domain (simplest; no CORS pain).
4. In Netlify → Site settings → Environment variables, add:

| Variable | Required | Example |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | `sk-ant-...` (console.anthropic.com) |
| `ANTHROPIC_MODEL` | no | defaults to `claude-sonnet-4-5` |
| `OPENAI_API_KEY` | only for DALL·E | `sk-...` |
| `STABILITY_API_KEY` | only for Stable Diffusion | `sk-...` |
| `SOLANA_RPC_URL` | for Solana verification | Helius/QuickNode/Alchemy mainnet URL |
| `ETH_RPC_URL` | for Ethereum verification | Alchemy/Infura mainnet URL |
| `ALLOWED_ORIGIN` | recommended | `https://yourdomain.com` (locks CORS to your site) |

5. Deploy. Your endpoints are live at `https://your-site.netlify.app/api/...`.

## Point your GoDaddy domain at it

In GoDaddy → My Domains → DNS:
- Add a **CNAME** record: host `forge` → value `your-site.netlify.app`
- In Netlify → Domain settings → add custom domain `forge.yourdomain.com`
- Netlify provisions HTTPS automatically. Done: the Forge lives at `https://forge.yourdomain.com`.

(Alternative: keep the HTML on GoDaddy hosting and set `BACKEND_URL` in the HTML to your Netlify URL — make sure `ALLOWED_ORIGIN` matches your GoDaddy domain.)

## Wire up the frontend

In `shift-forge-v6.html`, near the top of the script:

```js
var BACKEND_URL = '';            // same-origin (hosted together on Netlify)  ← recommended
// var BACKEND_URL = 'https://forge.yourdomain.com';   // cross-origin setup
```

Leave it `''` if frontend and backend share a domain. With a backend present:
- Claude analysis runs through `/api/forge-analyze` (full AI vision, no fallback analyzer)
- Art generation runs through `/api/generate-art` (users no longer paste API keys)
- Before forging, `/api/verify-ownership` is called — cards are only marked VERIFIED if the chain confirms the wallet owns the NFT

## Ownership verification notes

- **Solana**: send the NFT **mint address**. Checks `getTokenAccountsByOwner` for a balance ≥ 1.
- **Ethereum**: send `contract:tokenId` (e.g. `0xabc...def:4521`). Calls ERC-721 `ownerOf` and compares.
- ERC-1155 and compressed Solana NFTs (cNFTs) need different calls (`balanceOf(address,id)` / DAS `getAsset`) — extend `verify-ownership.js` when you onboard a collection that uses them.
- For maximum rigor, also have the wallet **sign a nonce** client-side and verify the signature server-side; that proves control of the key, not just that an address was typed in.

## Vercel instead of Netlify?

The function bodies port directly — wrap each in Vercel's `export default function handler(req, res)` style and put them in `api/`. The logic is identical.
