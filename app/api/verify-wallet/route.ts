/**
 * POST /api/verify-wallet
 *
 * Verifies the signature a player produced when connecting their wallet.
 * The message is plain text (no transaction, no fee). Used by the Forge to confirm the
 * person on the site controls the wallet before any payment or mint.
 *
 * Request body: { wallet: string, message: string, signature: string (base64) }
 * Response:     { verified: boolean, error?: string }
 */

import { NextResponse } from 'next/server';
import { verifyWalletProof } from '@/lib/walletProof';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ verified: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { wallet, message, signature } = body as { wallet?: string; message?: string; signature?: string };
  const result = verifyWalletProof(wallet || '', { message: message || '', signature: signature || '' });

  if (!result.ok) {
    return NextResponse.json({ verified: false, error: result.error }, { status: 401 });
  }
  return NextResponse.json({ verified: true });
}
