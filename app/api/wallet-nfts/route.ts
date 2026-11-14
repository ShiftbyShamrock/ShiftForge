import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, isValidSolanaAddress } from '@/lib/security';

// Fallback registry for popular verified collection names to bypass Helius DAS join lag
const COLLECTION_NAMES: Record<string, string> = {
  'F2EoZK3g9yaK99V4mFvDoxKQiUq9rESHUjqGFJ8K1PLL': 'Fuddy Dogs',
};

const HELIUS_TIMEOUT_MS = 8000;
const PINATA_TIMEOUT_MS = 2500;
const FORGED_TTL_MS = 45_000;
const PAGE_LIMIT = 1000;
const MAX_PAGES = 5;

// ── Forged-marker cache ────────────────────────────────────────────────────────
// The list of already-forged NFTs comes from Pinata. It is shared by every player, so cache it
// per server instance and never let a slow Pinata response hold up the player's NFT list.
let forgedCache: { set: Set<string>; at: number } | null = null;
let forgedInFlight: Promise<Set<string>> | null = null;

async function loadForgedMints(jwt: string): Promise<Set<string>> {
  const forged = new Set<string>();
  const pageSize = 1000;
  for (let offset = 0; offset < 10 * pageSize; offset += pageSize) {
    const url =
      `https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=shift-forge-` +
      `&pageLimit=${pageSize}&pageOffset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Pinata pinList ${res.status}`);
    const data = await res.json();
    const rows: any[] = data.rows || [];
    for (const row of rows) {
      const name: string = row.metadata?.name || '';
      if (name.startsWith('shift-forge-')) {
        const mint = name.slice('shift-forge-'.length);
        if (mint) forged.add(mint);
      }
    }
    if (rows.length < pageSize) break;
  }
  return forged;
}

async function getForgedMints(jwt?: string): Promise<Set<string>> {
  if (!jwt) return new Set();
  const now = Date.now();
  if (forgedCache && now - forgedCache.at < FORGED_TTL_MS) return forgedCache.set;

  const stale = forgedCache?.set ?? new Set<string>();
  if (!forgedInFlight) {
    forgedInFlight = loadForgedMints(jwt)
      .then((set) => {
        forgedCache = { set, at: Date.now() };
        return set;
      })
      .catch((err) => {
        console.error('Failed to fetch forge markers in wallet-nfts route:', err);
        return stale;
      })
      .finally(() => {
        forgedInFlight = null;
      });
  }
  // Slow Pinata → answer with the last known set (mint-card still enforces duplicates server-side).
  return Promise.race([
    forgedInFlight,
    new Promise<Set<string>>((resolve) => setTimeout(() => resolve(stale), PINATA_TIMEOUT_MS)),
  ]);
}

// ── Helius endpoint discovery ──────────────────────────────────────────────────
// Accepts the key in any common form (bare key, "api-key=…", full URL, quoted/with whitespace) from
// HELIUS_API_KEY or from a Helius RPC_URL, so a rotated key works wherever it was pasted.
let goodHeliusUrl: string | null = null;
const DEFAULT_HELIUS_KEY = '9c46cb9a-d266-4822-af1d-1a4603b14948';

function extractHeliusKey(raw: string | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^["']|["']$/g, '');
  const m = v.match(/api-key=([A-Za-z0-9-]+)/);
  if (m) v = m[1];
  v = v.trim();
  return /^[A-Za-z0-9-]{8,}$/.test(v) ? v : null;
}

function heliusCandidates(): string[] {
  const keys: string[] = [];
  const add = (k: string | null) => { if (k && !keys.includes(k)) keys.push(k); };
  add(extractHeliusKey(process.env.HELIUS_API_KEY));
  const rpc = process.env.RPC_URL || '';
  if (rpc.includes('helius-rpc.com')) add(extractHeliusKey(rpc));
  add(DEFAULT_HELIUS_KEY);
  const urls = keys.map((k) => `https://mainnet.helius-rpc.com/?api-key=${k}`);
  if (goodHeliusUrl && urls.includes(goodHeliusUrl)) {
    return [goodHeliusUrl, ...urls.filter((u) => u !== goodHeliusUrl)];
  }
  return urls;
}

function redact(url: string): string {
  return url.replace(/api-key=([A-Za-z0-9-]{4})[A-Za-z0-9-]*/, 'api-key=$1…');
}

// ── Helius DAS ─────────────────────────────────────────────────────────────────
async function das(url: string, id: string, method: string, params: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://www.shiftforge.io' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(HELIUS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Helius ${method} failed: ${res.status}`);
  return res.json();
}

function fetchAssetsPage(url: string, owner: string, page: number): Promise<any[]> {
  return das(url, `shift-forge-nfts-p${page}`, 'getAssetsByOwner', {
    ownerAddress: owner,
    page,
    limit: PAGE_LIMIT,
    options: {
      showFungible: false,
      showNativeBalance: false,
      showCollectionMetadata: false, // skip the database join on Helius side for a big speedup
      showUnverifiedCollections: true,
    },
  }).then((data) => data?.result?.items ?? []);
}

/**
 * /api/wallet-nfts — Proxies the Helius DAS getAssetsByOwner call.
 * Returns all NFTs in a wallet: Metaplex Core, legacy SPL, Token-2022,
 * compressed NFTs — everything in one unified call.
 *
 * Speed: everything that can run at the same time does (token-address resolution, the first
 * page of assets and the forged-marker lookup), extra pages are only requested for very large
 * wallets, and every upstream call has a hard timeout.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`wallet-nfts:${ip}`, 30, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    const wallet = body?.wallet;

    if (!wallet || !isValidSolanaAddress(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const candidates = heliusCandidates();
    if (candidates.length === 0) {
      console.error('wallet-nfts: no Helius key configured (set HELIUS_API_KEY or a Helius RPC_URL)');
      return NextResponse.json({ error: 'NFT service is not configured. Please try again later.' }, { status: 503 });
    }

    // Kick off the forged-marker lookup right away; it runs while we find a working Helius endpoint.
    const forgedPromise = getForgedMints(process.env.PINATA_JWT);

    // Find a Helius endpoint that works (remembered for later requests); skips rejected/rate-limited keys.
    let heliusUrl = '';
    let firstPageSpeculative: any[] | null = null;
    let resolved: any = null;
    let authRejected = false;
    for (const url of candidates) {
      try {
        const [r, page] = await Promise.all([
          das(url, 'resolve-token-mint', 'getAsset', { id: wallet }).catch(() => null),
          fetchAssetsPage(url, wallet, 1),
        ]);
        heliusUrl = url;
        resolved = r;
        firstPageSpeculative = page;
        goodHeliusUrl = url;
        console.log(`[wallet-nfts] Successfully connected to Helius via ${redact(url)}`);
        break;
      } catch (err: any) {
        if (goodHeliusUrl === url) goodHeliusUrl = null;
        if (/ 40[13]/.test(String(err?.message))) authRejected = true;
        console.error(`Helius endpoint failed (${redact(url)}):`, err?.message || err);
      }
    }
    if (!heliusUrl) {
      return NextResponse.json(
        { error: authRejected ? 'NFT service key was rejected by the provider (update HELIUS_API_KEY and redeploy).' : 'NFT service is busy. Please try again in a moment.', code: authRejected ? 'provider_auth' : 'provider_busy' },
        { status: 502 },
      );
    }

    let targetOwner: string = wallet;
    let resolvedOwner: string | null = null;
    const assetOwner: string | undefined = resolved?.result?.ownership?.owner;
    if (assetOwner) {
      targetOwner = assetOwner;
      resolvedOwner = assetOwner;
    }

    let firstPage = targetOwner === wallet
      ? firstPageSpeculative
      : await fetchAssetsPage(heliusUrl, targetOwner, 1).catch((err) => {
          console.error('Helius first page (resolved owner) failed:', err);
          return null;
        });

    if (firstPage === null) {
      return NextResponse.json(
        { error: 'NFT service is busy. Please try again in a moment.' },
        { status: 502 },
      );
    }

    let allItems: any[] = firstPage;

    // Only very large wallets need more than one page.
    if (firstPage.length >= PAGE_LIMIT) {
      const more = await Promise.all(
        Array.from({ length: MAX_PAGES - 1 }, (_, i) => i + 2).map((p) =>
          fetchAssetsPage(heliusUrl, targetOwner, p).catch((err) => {
            console.error(`Failed to fetch Helius page ${p}:`, err);
            return [] as any[];
          }),
        ),
      );
      for (const items of more) allItems = allItems.concat(items);
    }

    const forgedMints = await forgedPromise;

    // Map to a slim format the frontend expects
    const nfts = allItems
      .filter((item: any) => {
        if (!item) return false;
        // Only include non-fungible assets (NFTs)
        const iface = item.interface || '';
        return (
          iface === 'V1_NFT' ||
          iface === 'V2_NFT' ||
          iface === 'ProgrammableNFT' ||
          iface === 'MplCoreAsset' ||
          iface === 'Custom' ||
          iface === 'V1_PRINT' ||
          // Fallback: if it has an image and supply of 1, include it
          (item.content?.links?.image && item.supply?.print_current_supply <= 1)
        );
      })
      .map((item: any) => {
        const collGroup = item.grouping?.find((g: any) => g.group_key === 'collection');
        const collectionAddress = collGroup?.group_value || '';

        const isShift =
          item.content?.metadata?.symbol === 'SHIFT' ||
          item.content?.metadata?.description === 'Forged Shift Playable';

        // Use our fast local collection name mapping, or fallback to metadata symbol, collectionAddress
        const collectionName = isShift
          ? 'SHIFT Card Game'
          : COLLECTION_NAMES[collectionAddress] ||
            collGroup?.collection_metadata?.name ||
            item.content?.metadata?.symbol ||
            collectionAddress ||
            'Other';

        return {
          mint: item.id,
          name: item.content?.metadata?.name || item.id.slice(0, 8) + '…',
          image: item.content?.links?.image || item.content?.files?.[0]?.uri || '',
          collection: collectionAddress,
          collectionName,
          interface: item.interface || 'unknown',
          forged: forgedMints.has(item.id),
        };
      });

    return NextResponse.json(
      { nfts, total: nfts.length, resolvedOwner },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err: any) {
    console.error('wallet-nfts error:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to load wallet NFTs. Please try again.' },
      { status: 500 },
    );
  }
}
