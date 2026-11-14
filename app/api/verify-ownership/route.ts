/**
 * POST /api/verify-ownership
 *
 * Verifies that a wallet owns a specific NFT on Solana (see lib/ownership.ts —
 * Helius DAS first, RPC fallback, hard timeouts on every call).
 */

import { NextResponse } from 'next/server';
import { checkNftOwnership, isValidPublicKey } from '@/lib/ownership';
import { checkRateLimit, getClientIp } from '@/lib/security';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`verify-ownership:${ip}`, 45, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { owned: false, error: 'Too many verification requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ owned: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { chain, wallet, nft } = body as { chain?: string; wallet?: string; nft?: string };

    if (chain !== 'solana') {
      return NextResponse.json({ owned: false, error: 'Only Solana verification is supported' });
    }
    if (!wallet || typeof wallet !== 'string' || !isValidPublicKey(wallet)) {
      return NextResponse.json({ owned: false, error: 'Missing or invalid "wallet"' }, { status: 400 });
    }
    if (!nft || typeof nft !== 'string' || !isValidPublicKey(nft)) {
      return NextResponse.json({ owned: false, error: 'Missing or invalid "nft"' }, { status: 400 });
    }

    const result = await checkNftOwnership(wallet, nft);
    if (result.owned === null) {
      return NextResponse.json({ owned: false, error: 'Ownership lookup temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ owned: result.owned });
  } catch (error: unknown) {
    console.error('verify-ownership error:', error);
    return NextResponse.json({ owned: false, error: 'Verification failed' }, { status: 500 });
  }
}
