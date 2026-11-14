/**
 * POST /api/check-forged
 *
 * Checks if an NFT has already been forged into a SHIFT Playable card.
 * Queries Pinata for a marker pin with metadata name matching the source NFT mint.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, isValidSolanaAddress } from '@/lib/security';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`check-forged:${ip}`, 60, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { forged: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.nftMint || !isValidSolanaAddress(body.nftMint)) {
      return NextResponse.json({ forged: false, error: 'Missing or invalid nftMint' }, { status: 400 });
    }

    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json({ forged: false });
    }

    const markerName = `shift-forge-${body.nftMint}`;

    // Search Pinata for a pin with this exact metadata name
    const searchUrl = `https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=${encodeURIComponent(markerName)}&pageLimit=1`;

    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn('Pinata pinList check failed status:', res.status);
      return NextResponse.json({ forged: false });
    }

    const data = await res.json();
    const forged = (data.rows?.length ?? 0) > 0;

    return NextResponse.json({ forged });
  } catch (err: any) {
    console.warn('check-forged error:', err?.message || err);
    return NextResponse.json({ forged: false });
  }
}
