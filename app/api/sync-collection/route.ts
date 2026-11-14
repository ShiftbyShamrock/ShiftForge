import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NextResponse } from 'next/server';
import { getMintAuthorityKeypair, getOrCreateCollectionMint } from '@/app/api/mint-card/route';
import { verifyWalletProof } from '@/lib/walletProof';
import { checkRateLimit, getClientIp, isValidSolanaAddress } from '@/lib/security';

const RPC_ENDPOINTS = [
  process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.allnodes.com',
];

async function runWithRpcFallback<T>(queryFn: (conn: Connection) => Promise<T>): Promise<T> {
  let lastError: any = null;
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const conn = new Connection(rpcUrl, {
        commitment: 'confirmed',
        httpHeaders: { Origin: 'https://www.shiftforge.io' },
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
 * Request body: { wallet: string, proof?: { message: string, signature: string } }
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`sync-collection:${ip}`, 5, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many sync requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.wallet || !isValidSolanaAddress(body.wallet)) {
      return NextResponse.json({ error: 'Missing or invalid "wallet"' }, { status: 400 });
    }

    const { wallet, proof } = body as {
      wallet: string;
      proof?: { message: string; signature: string };
    };

    // Wallet signature is mandatory: this route spends the server's mint authority.
    const walletProof = verifyWalletProof(wallet, proof);
    if (!walletProof.ok) {
      return NextResponse.json(
        { error: `Wallet verification failed: ${walletProof.error}` },
        { status: 401 }
      );
    }

    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json({ error: 'PINATA_JWT not configured' }, { status: 500 });
    }

    let mintAuthorityKeypair;
    try {
      mintAuthorityKeypair = getMintAuthorityKeypair();
    } catch (err: any) {
      console.error('Server configuration error in sync-collection:', err?.message || err);
      return NextResponse.json({ error: 'Mint authority is not properly configured' }, { status: 500 });
    }

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
    const heliusApiKey =
      process.env.HELIUS_API_KEY ||
      (process.env.RPC_URL?.includes('helius-rpc.com')
        ? process.env.RPC_URL.match(/api-key=([A-Za-z0-9-]+)/)?.[1]
        : null) ||
      '9c46cb9a-d266-4822-af1d-1a4603b14948';
    const heliusRpc = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

    const dasRes = await fetch(heliusRpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://www.shiftforge.io' },
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
      signal: AbortSignal.timeout(10000),
    });

    if (!dasRes.ok) {
      return NextResponse.json(
        { error: `DAS API query failed: ${dasRes.statusText}` },
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
        console.warn(`Failed to sync card ${cardItem.id}:`, err?.message || err);
        errors.push(`${cardItem.id}: update failed`);
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
    console.error('Unexpected error in sync-collection route:', error?.message || error);
    return NextResponse.json(
      { error: 'Internal server error while syncing collection' },
      { status: 500 }
    );
  }
}
