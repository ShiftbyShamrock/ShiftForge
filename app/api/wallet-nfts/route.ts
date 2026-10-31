import { NextResponse } from 'next/server';

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

// ── Helius DAS ─────────────────────────────────────────────────────────────────
async function das(url: string, id: string, method: string, params: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    const { wallet } = await request.json();

    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Helius API key not configured' }, { status: 500 });
    }

    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

    // Kick everything off together. If the input turns out to be a single NFT address, we resolve
    // its owner and re-query below; for a normal wallet the speculative first page is the answer.
    const resolvePromise = das(heliusUrl, 'resolve-token-mint', 'getAsset', { id: wallet }).catch(() => null);
    const firstPagePromise: Promise<any[] | null> = fetchAssetsPage(heliusUrl, wallet, 1).catch((err) => {
      console.error('Helius first page failed:', err);
      return null;
    });
    const forgedPromise = getForgedMints(process.env.PINATA_JWT);

    const resolved = await resolvePromise;
    let targetOwner: string = wallet;
    let resolvedOwner: string | null = null;
    const assetOwner: string | undefined = resolved?.result?.ownership?.owner;
    if (assetOwner) {
      targetOwner = assetOwner;
      resolvedOwner = assetOwner;
    }

    let firstPage = targetOwner === wallet
      ? await firstPagePromise
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
    console.error('wallet-nfts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
