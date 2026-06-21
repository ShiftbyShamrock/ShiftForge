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

    // Fetch page 1 (up to 100 NFTs)
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'shift-forge-nfts',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 100,
          displayOptions: {
            showFungible: false,
            showNativeBalance: false,
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

    const items = (data.result?.items || []);

    // Map to a slim format the frontend expects
    const nfts = items
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
      .map((item: any) => ({
        mint: item.id,
        name: item.content?.metadata?.name || item.id.slice(0, 8) + '…',
        image: item.content?.links?.image || item.content?.files?.[0]?.uri || '',
        collection: item.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || '',
        collectionName: item.content?.metadata?.symbol || '',
        interface: item.interface || 'unknown',
      }));

    return NextResponse.json({ nfts, total: data.result?.total || nfts.length });
  } catch (err: any) {
    console.error('wallet-nfts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
