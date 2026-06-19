/**
 * POST /api/mint-card
 *
 * Verifies a SHIFT token payment transaction on Solana and records the mint.
 * Checks that the transaction exists, succeeded, and contains a token transfer
 * of at least 7 SHIFT to the treasury wallet.
 *
 * Once the mint authority is configured, this endpoint will also trigger the
 * actual NFT mint via Metaplex.
 *
 * Request body: { signature: string, wallet: string, card: object }
 *
 * Response (success): {
 *   pendingMint: true,
 *   message: string,
 *   signature: string,
 *   card: object
 * }
 *
 * Error codes:
 *   400 — missing or invalid input
 *   402 — payment not found or insufficient
 *   500 — server error
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';

const SHIFT_TOKEN_MINT = process.env.SHIFT_TOKEN_MINT || 'GG1HVvRUMeE3behg1zrXKTT3dwinGhZeWHPJekSCqiqA';
const SHIFT_TREASURY = process.env.SHIFT_TREASURY || 'CC5bjHvxKBmGsoSnCY6nyC24jDzqUcU51Vq8gwc1pv2n';
const SHIFT_MINT_FEE = Number(process.env.SHIFT_MINT_FEE) || 7;
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { signature, wallet, card } = body as {
      signature?: string;
      wallet?: string;
      card?: Record<string, unknown>;
    };

    // --- Input validation ---
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "signature"' }, { status: 400 });
    }
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "wallet"' }, { status: 400 });
    }
    if (!card || typeof card !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid "card"' }, { status: 400 });
    }

    const connection = new Connection(RPC_URL, 'confirmed');

    // --- Fetch the on-chain transaction ---
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json(
        { error: 'Transaction not found. It may not be confirmed yet.' },
        { status: 402 },
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { error: 'Transaction failed on-chain', details: tx.meta.err },
        { status: 402 },
      );
    }

    // --- Verify SHIFT token transfer to treasury ---
    const preBalances = tx.meta?.preTokenBalances ?? [];
    const postBalances = tx.meta?.postTokenBalances ?? [];

    /**
     * Find the treasury's SHIFT token account in post-balances and compare
     * against its pre-balance to determine the net inflow.
     */
    let treasuryReceived = 0;

    for (const post of postBalances) {
      const isTreasuryOwner = post.owner === SHIFT_TREASURY;
      const isShiftMint = post.mint === SHIFT_TOKEN_MINT;

      if (isTreasuryOwner && isShiftMint) {
        const postAmount = post.uiTokenAmount?.uiAmount ?? 0;

        // Find matching pre-balance for the same account index
        const pre = preBalances.find(
          (p) => p.accountIndex === post.accountIndex && p.mint === SHIFT_TOKEN_MINT,
        );
        const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;

        treasuryReceived += postAmount - preAmount;
      }
    }

    if (treasuryReceived < SHIFT_MINT_FEE) {
      return NextResponse.json(
        {
          error: `Insufficient payment. Expected at least ${SHIFT_MINT_FEE} SHIFT, but treasury received ${treasuryReceived}.`,
        },
        { status: 402 },
      );
    }

    // --- Payment verified — record the pending mint ---
    // TODO: Once the Metaplex mint authority is configured, trigger the actual
    //       NFT mint here instead of returning a pending status.

    return NextResponse.json({
      pendingMint: true,
      message:
        'Payment of 7 SHIFT verified. Your card will be minted once the mint authority is configured.',
      signature,
      card,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
