import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NextResponse } from 'next/server';
import { getMintAuthorityKeypair, getOrCreateCollectionMint } from '@/app/api/mint-card/route';

const RPC_ENDPOINTS = [
  process.env.RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=bbece07e-3cf0-4dbd-8284-c21c328b7abe',
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.allnodes.com',
];

async function runWithRpcFallback<T>(queryFn: (conn: Connection) => Promise<T>): Promise<T> {
  let lastError: any = null;
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const conn = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 120000,
      });
      return await queryFn(conn);
    } catch (err: any) {
      console.warn(`RPC call failed on ${rpcUrl}: ${err.message || err}. Trying next endpoint...`);
      lastError = err;
    }
  }
  throw lastError || new Error('All Solana RPC endpoints failed.');
}

/**
 * POST /api/sync-collection
 *
 * Automatically finds all playable SHIFT card NFTs owned by the user's wallet
 * and sets/verifies their on-chain Metaplex collection to the official
 * "SHIFT Card Game" Collection NFT.
 *
 * This retroactively fixes cards previously minted so that Phantom, Solflare,
 * and Backpack organize all cards together under one single "SHIFT Card Game" folder.
 *
 * Request body: { wallet: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.wallet || typeof body.wallet !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "wallet"' }, { status: 400 });
    }

    const { wallet } = body as { wallet: string };
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json({ error: 'PINATA_JWT not configured' }, { status: 500 });
    }

    const mintAuthorityKeypair = getMintAuthorityKeypair();

    // 1. Resolve or create the official on-chain collection mint
    const collectionMint = await runWithRpcFallback(async (conn) => {
      return await getOrCreateCollectionMint(conn, mintAuthorityKeypair, pinataJwt);
    });

    if (!collectionMint) {
      return NextResponse.json(
        { error: 'Failed to resolve or create the on-chain SHIFT Card Game Collection NFT.' },
        { status: 500 }
      );
    }

    // 2. Fetch all NFTs owned by the wallet via Helius DAS getAssetsByOwner
    const heliusRpc = process.env.RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=bbece07e-3cf0-4dbd-8284-c21c328b7abe';
    const dasRes = await fetch(heliusRpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'sync-collection',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 100,
        },
      }),
    });

    if (!dasRes.ok) {
      return NextResponse.json(
        { error: `Helius DAS API error: ${dasRes.statusText}` },
        { status: 502 }
      );
    }

    const dasData = await dasRes.json();
    const allItems: any[] = dasData.result?.items || [];

    // 3. Filter for SHIFT cards
    const shiftCards = allItems.filter((item: any) => {
      const symbol = item.content?.metadata?.symbol;
      const desc = item.content?.metadata?.description || '';
      return symbol === 'SHIFT' || desc.includes('Shift') || desc === 'Forged Shift Playable';
    });

    let syncedCount = 0;
    let alreadySyncedCount = 0;
    const errors: string[] = [];

    // 4. Update and verify any cards not yet verified in the collection
    for (const cardItem of shiftCards) {
      const isAlreadyVerified = cardItem.grouping?.some(
        (g: any) => g.group_key === 'collection' && g.group_value === collectionMint && g.verified !== false
      );

      if (isAlreadyVerified) {
        alreadySyncedCount++;
        continue;
      }

      try {
        await runWithRpcFallback(async (conn) => {
          const metaplex = Metaplex.make(conn).use(keypairIdentity(mintAuthorityKeypair));
          const nft = await metaplex.nfts().findByMint({
            mintAddress: new PublicKey(cardItem.id),
          });

          // Set on-chain collection if not set
          await metaplex.nfts().update({
            nftOrSft: nft,
            collection: new PublicKey(collectionMint),
          });

          // Verify the collection with the mint authority
          await metaplex.nfts().verifyCollection({
            mintAddress: new PublicKey(cardItem.id),
            collectionMintAddress: new PublicKey(collectionMint),
            collectionAuthority: mintAuthorityKeypair,
          });
        });
        syncedCount++;
        console.log(`Synced & verified card ${cardItem.id} into SHIFT collection`);
      } catch (err: any) {
        console.warn(`Failed to sync card ${cardItem.id}:`, err.message || err);
        errors.push(`${cardItem.id}: ${err.message || err}`);
      }
    }

    return NextResponse.json({
      success: true,
      collectionMint,
      totalShiftCards: shiftCards.length,
      syncedCount,
      alreadySyncedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Unexpected error in sync-collection route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
