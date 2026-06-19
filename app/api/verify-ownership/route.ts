/**
 * POST /api/verify-ownership
 *
 * Verifies that a wallet owns a specific NFT on Solana by checking parsed
 * token accounts for the given mint. Returns { owned: true } when the wallet
 * holds at least 1 unit of the token.
 *
 * Request body: { chain: string, wallet: string, nft: string }
 *
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ owned: false, error: message }, { status: 500 });
  }
}
