import { NextResponse } from 'next/server';

/**
 * /api/proxy-image — Fetches an NFT image server-side to bypass CORS.
 * Returns the image as base64 data URL so the frontend can use it
 * on a canvas without tainted-canvas errors.
 */
export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }

    // Only allow http/https URLs
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'SHIFT-Forge/1.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Image fetch failed: ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ dataUrl, contentType });
  } catch (err: any) {
    console.error('proxy-image error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to proxy image' },
      { status: 500 }
    );
  }
}
