/**
 * POST /api/mint-quote
 *
 * Returns the SHIFT token minting fee quote. If a wallet address is provided,
 * queries the Solana RPC for the wallet's SHIFT token balance and calculates
 * whether the wallet can afford the mint fee.
 *
 * Request body: { wallet?: string }
 *
 * Response: {
 *   feeShift: number,
 *   configured: boolean,
 *   walletBalance: number | null,
 *   canAfford: boolean | null,
 *   treasury: string,
 *   tokenMint: string,
 *   decimals: number
 * }
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';

const SHIFT_TOKEN_MINT = process.env.SHIFT_TOKEN_MINT || 'GG1HVvRUMeE3behg1zrXKTT3dwinGhZeWHPJekSCqiqA';
const SHIFT_TREASURY = process.env.SHIFT_TREASURY || 'CC5bjHvxKBmGsoSnCY6nyC24jDzqUcU51Vq8gwc1pv2n';
const SHIFT_MINT_FEE = Number(process.env.SHIFT_MINT_FEE) || 7;
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wallet } = body as { wallet?: string };

    const configured = Boolean(SHIFT_TOKEN_MINT && SHIFT_TREASURY && SHIFT_MINT_FEE);

    const connection = new Connection(RPC_URL, 'confirmed');
    const mintPubkey = new PublicKey(SHIFT_TOKEN_MINT);

    // Query the mint account to get the actual decimals
    let decimals = 9;
    try {
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      if (
        mintInfo.value &&
        'parsed' in mintInfo.value.data &&
        mintInfo.value.data.parsed?.info?.decimals !== undefined
      ) {
        decimals = mintInfo.value.data.parsed.info.decimals;
      }
    } catch {
      // Fall back to default decimals = 9
    }

    let walletBalance: number | null = null;
    let canAfford: boolean | null = null;

    if (wallet) {
      try {
        const walletPubkey = new PublicKey(wallet);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
          mint: mintPubkey,
        });

        walletBalance = 0;
        for (const { account } of tokenAccounts.value) {
          const parsed = account.data.parsed;
          const amount = parsed?.info?.tokenAmount?.uiAmount ?? 0;
          walletBalance += amount;
        }

        canAfford = walletBalance >= SHIFT_MINT_FEE;
      } catch {
        // Wallet query failed — return nulls
        walletBalance = null;
        canAfford = null;
      }
    }

    return NextResponse.json({
      feeShift: SHIFT_MINT_FEE,
      configured,
      walletBalance,
      canAfford,
      treasury: SHIFT_TREASURY,
      tokenMint: SHIFT_TOKEN_MINT,
      decimals,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
