/**
 * POST /api/verify-ownership
 *
 * Verifies that a wallet owns a specific NFT on Solana.
 * Uses the Helius DAS API (getAsset) as primary method — works for ALL
 * NFT types: Metaplex Core, legacy SPL, Token-2022, and compressed.
 * Falls back to raw RPC getParsedTokenAccountsByOwner for SPL tokens
 * if Helius is unavailable.
 *
 * Request body: { chain: string, wallet: string, nft: string }
 * Response: { owned: boolean, error?: string }
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ owned: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { chain, wallet, nft } = body as {
      chain?: string;
      wallet?: string;
      nft?: string;
    };

    // --- Only Solana is supported ---
    if (chain !== 'solana') {
      return NextResponse.json({
        owned: false,
        error: 'Only Solana verification is supported',
      });
    }

    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json(
        { owned: false, error: 'Missing or invalid "wallet"' },
        { status: 400 },
      );
    }

    if (!nft || typeof nft !== 'string') {
      return NextResponse.json(
        { owned: false, error: 'Missing or invalid "nft"' },
        { status: 400 },
      );
    }

    // --- Method 1: Helius DAS getAsset (works for ALL NFT types) ---
    const apiKey = process.env.HELIUS_API_KEY;
    if (apiKey) {
      try {
        const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        const response = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'verify-ownership',
            method: 'getAsset',
            params: { id: nft },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const asset = data.result;

          if (asset) {
            // Check if the asset's owner matches the wallet
            const assetOwner = asset.ownership?.owner || '';
            const owned = assetOwner.toLowerCase() === wallet.toLowerCase();
            return NextResponse.json({ owned });
          }
        }
      } catch (heliusErr) {
        console.warn('Helius DAS getAsset failed, falling back to RPC:', heliusErr);
      }
    }

    // --- Method 2: Fallback to raw RPC for SPL Token mints ---
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const walletPubkey = new PublicKey(wallet);
      const mintPubkey = new PublicKey(nft);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
        mint: mintPubkey,
      });

      const owned = tokenAccounts.value.some((ta) => {
        const uiAmount = ta.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0;
        return uiAmount >= 1;
      });

      return NextResponse.json({ owned });
    } catch (rpcErr) {
      // If RPC also fails (e.g., Metaplex Core mint without Helius), return unverified
      const msg = rpcErr instanceof Error ? rpcErr.message : 'RPC verification failed';
      console.warn('RPC fallback also failed:', msg);
      return NextResponse.json({ owned: false, error: msg }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ owned: false, error: message }, { status: 500 });
  }
}
