/**
 * Server-side NFT ownership check, shared by /api/verify-ownership and /api/mint-card.
 *
 * Primary: Helius DAS `getAsset` (works for legacy, Core, Token-2022 and compressed NFTs).
 * Fallback: `getParsedTokenAccountsByOwner` on the RPC for classic SPL NFTs.
 * Every network call has a hard timeout so a slow provider can never hang the Forge.
 */

import { Connection, PublicKey } from '@solana/web3.js';

const DEFAULT_RPC = 'https://mainnet.helius-rpc.com/?api-key=bbece07e-3cf0-4dbd-8284-c21c328b7abe';
const STEP_TIMEOUT_MS = 7000;

function rpcUrl(): string {
  return process.env.RPC_URL || DEFAULT_RPC;
}

/** DAS lives on the Helius endpoint. Prefer an explicit key, else reuse the RPC URL if it is Helius. */
function dasUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  if (key) return `https://mainnet.helius-rpc.com/?api-key=${key}`;
  const rpc = rpcUrl();
  return rpc.includes('helius-rpc.com') ? rpc : DEFAULT_RPC;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export interface OwnershipResult {
  /** true/false when the chain gave a definitive answer; null when it could not be determined */
  owned: boolean | null;
  error?: string;
}

export async function checkNftOwnership(wallet: string, nft: string): Promise<OwnershipResult> {
  // --- Method 1: Helius DAS getAsset ---
  try {
    const res = await fetch(dasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'verify-ownership', method: 'getAsset', params: { id: nft } }),
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      const owner: string = data?.result?.ownership?.owner || '';
      if (owner) return { owned: owner === wallet };
    }
  } catch (err: any) {
    console.warn('[ownership] DAS getAsset failed:', err?.message || err);
  }

  // --- Method 2: raw RPC token accounts ---
  try {
    const connection = new Connection(rpcUrl(), 'confirmed');
    const accounts = await withTimeout(
      connection.getParsedTokenAccountsByOwner(new PublicKey(wallet), { mint: new PublicKey(nft) }),
      STEP_TIMEOUT_MS,
      'RPC token lookup',
    );
    const owned = accounts.value.some((ta) => {
      const ui = (ta.account.data as any)?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
      return ui >= 1;
    });
    return { owned };
  } catch (err: any) {
    return { owned: null, error: err?.message || 'Ownership lookup unavailable' };
  }
}
