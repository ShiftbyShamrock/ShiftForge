import { NextResponse } from 'next/server';

/**
 * /api/wallet-nfts — Proxies the Helius DAS getAssetsByOwner call.
 * Returns all NFTs in a wallet: Metaplex Core, legacy SPL, Token-2022,
 * compressed NFTs — everything in one unified call.
 *
 * The Helius API key is kept server-side so it never leaks to the browser.
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

    let page = 1;
    let allItems: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `shift-forge-nfts-p${page}`,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: targetOwner,
            page,
            limit: 1000,
            options: {
              showFungible: false,
              showNativeBalance: false,
              showCollectionMetadata: true,
              showUnverifiedCollections: true,
            },
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Helius DAS error:', response.status, text);
        return NextResponse.json(
          { error: `Helius API error: ${response.status}` },
          { status: 502 }
        );
      }

      const data = await response.json();
      if (data.error) {
        console.error('Helius RPC error:', data.error);
        return NextResponse.json(
          { error: data.error.message || 'Helius RPC error' },
          { status: 502 }
        );
      }

      const items = data.result?.items || [];
      allItems = allItems.concat(items);

      if (items.length < 1000) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Map to a slim format the frontend expects
    const nfts = allItems
      .filter((item: any) => {
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
        const collectionName = collGroup?.collection_metadata?.name || item.content?.metadata?.symbol || collectionAddress || 'Other';
        return {
          mint: item.id,
          name: item.content?.metadata?.name || item.id.slice(0, 8) + '…',
          image: item.content?.links?.image || item.content?.files?.[0]?.uri || '',
          collection: collectionAddress,
          collectionName: collectionName,
          interface: item.interface || 'unknown',
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
