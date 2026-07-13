import { NextResponse } from 'next/server';

/**
 * Helper to fetch image data with resilient redirection handling.
 * Resolves permagate.io sandbox subdomains by proxying through gateway.irys.xyz
 * and rewriting any legacy.datasprite-cdn.com redirects to permagate.io.
 */
async function fetchResilientImage(url: string) {
  let targetUrl = url;

  // If the URL points directly to permagate.io, convert it to gateway.irys.xyz first
  // to leverage their 302 redirect and extract the correct sandbox subdomain.
  if (targetUrl.includes('permagate.io') && !targetUrl.includes('.permagate.io')) {
    targetUrl = targetUrl.replace('permagate.io', 'gateway.irys.xyz');
  }

  let response = await fetch(targetUrl, {
    headers: {
      'Accept': 'image/*',
      'User-Agent': 'SHIFT-Forge/1.0',
    },
    redirect: 'manual'
  });

  // Intercept Irys redirects (302/301) to replace the broken legacy.datasprite-cdn.com
  if (response.status === 302 || response.status === 301) {
    const redirectUrl = response.headers.get('location');
    if (redirectUrl) {
      let rewrittenUrl = redirectUrl;
      if (redirectUrl.includes('legacy.datasprite-cdn.com')) {
        rewrittenUrl = redirectUrl.replace('legacy.datasprite-cdn.com', 'permagate.io');
      }
      console.log(`[Proxy Image] Redirect intercepted. Rewriting to: ${rewrittenUrl}`);
      response = await fetch(rewrittenUrl, {
        headers: {
          'Accept': 'image/*',
          'User-Agent': 'SHIFT-Forge/1.0',
        }
      });
    }
  }

  // Fallback: If the response is not ok and we attempted a rewrite, try fetching the original URL directly
  if (!response.ok && targetUrl !== url) {
    console.warn(`[Proxy Image] Rewritten fetch failed with status ${response.status}. Retrying original URL: ${url}`);
    response = await fetch(url, {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'SHIFT-Forge/1.0',
      }
    });
  }

  return response;
}

/**
 * POST /api/proxy-image
 * Fetches an NFT image server-side to bypass CORS.
 * Returns the image as base64 data URL so the frontend can use it on a canvas.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const url = body?.url;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }

    const response = await fetchResilientImage(url);

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
    console.error('[Proxy Image POST] error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to proxy image' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/proxy-image
 * Fetches the NFT image and returns the binary image file directly with caching.
 * Useful as a direct img src: <img src="/api/proxy-image?url=...">
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new Response('Missing url query parameter', { status: 400 });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return new Response('Invalid URL scheme', { status: 400 });
    }

    const response = await fetchResilientImage(url);

    if (!response.ok) {
      return new Response(`Failed to fetch image: ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('[Proxy Image GET] error:', err);
    return new Response(err.message || 'Failed to proxy image', { status: 500 });
  }
}
