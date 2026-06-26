/**
 * POST /api/check-forged
 *
 * Checks if an NFT has already been forged into a SHIFT Playable card.
 * Queries Pinata for a marker pin with metadata name matching the source NFT mint.
 *
 * Request body: { nftMint: string }
 * Response: { forged: boolean }
 */

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.nftMint || typeof body.nftMint !== 'string') {
      return NextResponse.json({ forged: false, error: 'Missing nftMint' }, { status: 400 });
    }

    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      // If Pinata isn't configured, allow minting (can't check)
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
    });

    if (!res.ok) {
      console.error('Pinata pinList check failed:', res.status);
      // On error, allow minting rather than blocking
      return NextResponse.json({ forged: false });
    }

    const data = await res.json();
    const forged = (data.rows?.length ?? 0) > 0;

    return NextResponse.json({ forged });
  } catch (err: any) {
    console.error('check-forged error:', err);
    return NextResponse.json({ forged: false });
  }
}
