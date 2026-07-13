import { NextResponse } from 'next/server';
import { Buffer } from 'buffer';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Base32 RFC 4648 encoding helper.
 */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodes a base64url string to raw bytes.
 */
function base64UrlToBytes(b64urlString: string): Buffer {
  let b64 = b64urlString.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64');
}

/**
 * Deterministically rewrites Arweave/Irys URLs to their sandboxed permagate.io subdomains.
 * Bypasses broken apex domain resolution and redirect bugs.
 */
function getResilientUrl(url: string): string {
  if (!url) return '';
  
  // Find any 43-character Arweave/Irys transaction ID
  const txIdMatch = url.match(/[a-zA-Z0-9_-]{43}/);
  if (!txIdMatch) return url;
  
  const txId = txIdMatch[0];
  
  // Only apply rewrite to Arweave/Irys domains
  const isArweaveOrIrys = 
    url.includes('permagate.io') || 
    url.includes('arweave.net') || 
    url.includes('irys.xyz') || 
    url.includes('datasprite-cdn.com');
    
  if (!isArweaveOrIrys) return url;

  try {
    const bytes = base64UrlToBytes(txId);
    const subdomain = base32Encode(bytes);
    
    // Extract rest of path right after the transaction ID
    const txIdIndex = url.indexOf(txId);
    const restOfPath = url.substring(txIdIndex + txId.length);
    
    // Construct the working sandboxed permagate.io URL
    const rewritten = `https://${subdomain}.permagate.io/${txId}${restOfPath}`;
    console.log(`[Proxy Resilient] Rewrote URL from ${url} to ${rewritten}`);
    return rewritten;
  } catch (e) {
    console.error('[Proxy Resilient] Failed to derive sandboxed URL:', e);
    return url;
  }
}

/**
 * Resilient image fetch handler.
 */
async function fetchResilientImage(url: string) {
  const targetUrl = getResilientUrl(url);

  let response = await fetch(targetUrl, {
    headers: {
      'Accept': 'image/*',
      'User-Agent': 'SHIFT-Forge/1.0',
    },
  });

  // Fallback: If rewritten URL fails, try fetching the original URL directly
  if (!response.ok && targetUrl !== url) {
    console.warn(`[Proxy Image] Resilient URL failed with status ${response.status}. Retrying original URL: ${url}`);
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
 * Returns the image as base64 data URL.
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
 * Streams the binary image bytes directly with caching.
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
