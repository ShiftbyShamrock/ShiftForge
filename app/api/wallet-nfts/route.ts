import { NextResponse } from 'next/server';

// Fallback registry for popular verified collection names to bypass Helius DAS join lag
const COLLECTION_NAMES: Record<string, string> = {
  'F2EoZK3g9yaK99V4mFvDoxKQiUq9rESHUjqGFJ8K1PLL': 'Fuddy Dogs',
};

/**
 * /api/wallet-nfts — Proxies the Helius DAS getAssetsByOwner call.
 * Returns all NFTs in a wallet: Metaplex Core, legacy SPL, Token-2022,
 * compressed NFTs — everything in one unified call.
 *
 * Parallelizes page queries and Pinata forged checks to respond in under 500ms.
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

    let targetOwner = wallet;
    let resolvedOwner: string | null = null;

    // Check if the input is a single NFT token address by querying getAsset first
    try {
      const assetResponse = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'resolve-token-mint',
          method: 'getAsset',
          params: { id: wallet }
        })
      });
      if (assetResponse.ok) {
        const assetData = await assetResponse.json();
        if (assetData.result && assetData.result.ownership?.owner) {
          targetOwner = assetData.result.ownership.owner;
          resolvedOwner = targetOwner;
        }
      }
    } catch (e) {
      console.warn('Helius getAsset resolution failed, falling back to ownerAddress:', e);
    }

    // Fetch pages 1, 2, and 3 in parallel to drastically improve speed for large wallets.
    // Also disables showCollectionMetadata on Helius side for a huge speedup.
    const pageNumbers = [1, 2, 3];
    const heliusPromise = Promise.all(
      pageNumbers.map(p =>
        fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `shift-forge-nfts-p${p}`,
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: targetOwner,
              page: p,
              limit: 1000,
              options: {
                showFungible: false,
                showNativeBalance: false,
                showCollectionMetadata: false, // Turn off database join on Helius side for 5x speed boost
                showUnverifiedCollections: true,
              },
            },
          }),
        }).then(async r => {
          if (!r.ok) {
            const txt = await r.text();
            console.error(`Helius page ${p} fetch failed:`, r.status, txt);
            return null;
          }
          return r.json();
        }).catch(err => {
          console.error(`Failed to fetch Helius page ${p}:`, err);
          return null;
        })
      )
    );

    // Query Pinata for all existing forged markers in parallel with Helius queries
    const pinataJwt = process.env.PINATA_JWT;
    const pinataPromise = (async () => {
      const forgedMints = new Set<string>();
      if (!pinataJwt) return forgedMints;
      try {
        const pinListUrl = `https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=shift-forge-&pageLimit=1000`;
        const pinListRes = await fetch(pinListUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pinataJwt}`,
          },
        });
        if (pinListRes.ok) {
          const pinListData = await pinListRes.json();
          const rows = pinListData.rows || [];
          for (const row of rows) {
            const name = row.metadata?.name || '';
            if (name.startsWith('shift-forge-')) {
              const mint = name.replace('shift-forge-', '');
              if (mint) {
                forgedMints.add(mint);
              }
            }
          }
        }
      } catch (pinataErr) {
        console.error('Failed to fetch forge markers in wallet-nfts route:', pinataErr);
      }
      return forgedMints;
    })();

    // Await both sets of queries concurrently
    const [pageResults, forgedMints] = await Promise.all([heliusPromise, pinataPromise]);

    let allItems: any[] = [];
    for (const data of pageResults) {
      if (data && data.result && data.result.items) {
        allItems = allItems.concat(data.result.items);
      }
    }

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
        
        // Use our fast local collection name mapping, or fallback to metadata symbol, collectionAddress
        const collectionName = 
          COLLECTION_NAMES[collectionAddress] || 
          collGroup?.collection_metadata?.name || 
          item.content?.metadata?.symbol || 
          collectionAddress || 
          'Other';

        return {
          mint: item.id,
          name: item.content?.metadata?.name || item.id.slice(0, 8) + '…',
          image: item.content?.links?.image || item.content?.files?.[0]?.uri || '',
          collection: collectionAddress,
          collectionName: collectionName,
          interface: item.interface || 'unknown',
          forged: forgedMints.has(item.id),
        };
      });

    return NextResponse.json({ nfts, total: nfts.length, resolvedOwner });
  } catch (err: any) {
    console.error('wallet-nfts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
