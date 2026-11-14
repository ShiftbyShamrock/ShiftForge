/**
 * POST /api/rpc
 *
 * Same-origin Solana JSON-RPC proxy for the Forge frontend.
 *
 * Why: browsers can't reliably use the free public Solana RPC (it blocks browser origins), and a keyed
 * provider URL must never be sent to the browser. The client talks to this route; the server forwards
 * allow-listed read/send methods to the private RPC (Helius) with fallbacks. The key never leaves the server.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/security';

const ALLOWED_METHODS = new Set([
  'getHealth',
  'getLatestBlockhash',
  'getRecentBlockhash',
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountsByOwner',
  'getTokenAccountBalance',
  'getSignatureStatuses',
  'getTransaction',
  'getBlockHeight',
  'getSlot',
  'isBlockhashValid',
  'getFeeForMessage',
  'getMinimumBalanceForRentExemption',
  'simulateTransaction',
  'sendTransaction',
]);

const MAX_BODY_BYTES = 64 * 1024; // signed transactions are < 2KB; keep generous headroom
const MAX_BATCH = 10;
const DEFAULT_HELIUS_KEY = '9c46cb9a-d266-4822-af1d-1a4603b14948';

function pickKey(raw?: string): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^["']|["']$/g, '');
  const m = v.match(/api-key=([A-Za-z0-9-]+)/);
  if (m) v = m[1];
  return /^[A-Za-z0-9-]{8,}$/.test(v) ? v : null;
}

function upstreamUrls(): string[] {
  const urls: string[] = [];
  const key = pickKey(process.env.HELIUS_API_KEY) || (process.env.RPC_URL?.includes('helius-rpc.com') ? pickKey(process.env.RPC_URL) : null) || DEFAULT_HELIUS_KEY;
  if (key) urls.push(`https://mainnet.helius-rpc.com/?api-key=${key}`);
  if (DEFAULT_HELIUS_KEY && key !== DEFAULT_HELIUS_KEY) {
    urls.push(`https://mainnet.helius-rpc.com/?api-key=${DEFAULT_HELIUS_KEY}`);
  }
  if (process.env.RPC_URL && !process.env.RPC_URL.includes('helius-rpc.com')) urls.push(process.env.RPC_URL);
  urls.push('https://api.mainnet-beta.solana.com');
  return urls;
}

function validateCall(c: any): string | null {
  if (!c || typeof c !== 'object' || typeof c.method !== 'string') return 'Invalid JSON-RPC request';
  if (!ALLOWED_METHODS.has(c.method)) return `Method not allowed: ${c.method.slice(0, 40)}`;
  return null;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`rpc:${ip}`, 240, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Rate limit exceeded' } },
      { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } },
    );
  }

  const cl = request.headers.get('content-length');
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, { status: 413 });
  }

  const raw = await request.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }

  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid batch size' } }, { status: 400 });
  }
  for (const c of calls) {
    const bad = validateCall(c);
    if (bad) {
      return NextResponse.json({ jsonrpc: '2.0', id: c?.id ?? null, error: { code: -32601, message: bad } }, { status: 403 });
    }
  }

  // Forward only the safe fields (never client-supplied headers/urls).
  const forward = JSON.stringify(
    Array.isArray(payload)
      ? payload.map((c) => ({ jsonrpc: '2.0', id: c.id, method: c.method, params: c.params }))
      : { jsonrpc: '2.0', id: payload.id, method: payload.method, params: payload.params },
  );

  let lastStatus = 502;
  for (const url of upstreamUrls()) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.shiftforge.io' },
        body: forward,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const text = await res.text();
        return new Response(text, {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      lastStatus = res.status;
      console.warn(`[rpc proxy] upstream ${res.status}; trying next endpoint`);
    } catch (err: any) {
      console.warn('[rpc proxy] upstream error:', err?.message || err);
    }
  }

  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32003, message: `RPC unavailable (${lastStatus})` } },
    { status: 502 },
  );
}

export const maxDuration = 30;
