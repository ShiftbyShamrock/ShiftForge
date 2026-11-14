/**
 * POST /api/mint-quote
 *
 * Returns the mint fee quote for all payment methods (SOL, SHIFT, CULTURE SHIFT).
 * If a wallet address is provided, queries the Solana RPC for the wallet's
 * balances and calculates whether the wallet can afford each mint fee.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, isValidSolanaAddress } from '@/lib/security';

const SHIFT_TOKEN_MINT = process.env.SHIFT_TOKEN_MINT || 'GG1HVvRUMeE3behg1zrXKTT3dwinGhZeWHPJekSCqiqA';
const CULTURE_TOKEN_MINT = 'BtpQ3WZsA5rpA45iNWxQJ9djSurnXhrDYMYnyNc1LDrK';
const SHIFT_TREASURY = process.env.SHIFT_TREASURY || 'CC5bjHvxKBmGsoSnCY6nyC24jDzqUcU51Vq8gwc1pv2n';
const SHIFT_MINT_FEE = 33;
const SOL_MINT_FEE = 0.13;
const CULTURE_MINT_FEE = 1000000;

// Server-side RPC endpoints (used privately to query balances)
const SERVER_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const RPC_ENDPOINTS = [
  SERVER_RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.allnodes.com',
];

// Public client RPC endpoint (never leaks server private keys)
const CLIENT_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function runWithRpcFallback<T>(queryFn: (conn: Connection) => Promise<T>): Promise<T> {
  let lastError: any = null;
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const conn = new Connection(rpcUrl, 'confirmed');
      return await queryFn(conn);
    } catch (err: any) {
      console.warn(`RPC call failed on ${rpcUrl}: ${err.message || err}. Trying next endpoint...`);
      lastError = err;
    }
  }
  throw lastError || new Error('All Solana RPC endpoints failed.');
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`mint-quote:${ip}`, 45, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { wallet } = body as { wallet?: string };

    if (wallet && !isValidSolanaAddress(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const configured = Boolean(SHIFT_TOKEN_MINT && SHIFT_TREASURY && SHIFT_MINT_FEE);
    const shiftMintPubkey = new PublicKey(SHIFT_TOKEN_MINT);
    const cultureMintPubkey = new PublicKey(CULTURE_TOKEN_MINT);

    // Query the SHIFT mint account to get the actual decimals using RPC fallback
    let decimals = 9;
    let cultureDecimals = 9;
    try {
      const mintInfoResult = await runWithRpcFallback(async (conn) => {
        const [shiftMintInfo, cultureMintInfo] = await Promise.all([
          conn.getParsedAccountInfo(shiftMintPubkey),
          conn.getParsedAccountInfo(cultureMintPubkey),
        ]);
        return { shiftMintInfo, cultureMintInfo };
      });

      if (
        mintInfoResult.shiftMintInfo.value &&
        'parsed' in mintInfoResult.shiftMintInfo.value.data &&
        mintInfoResult.shiftMintInfo.value.data.parsed?.info?.decimals !== undefined
      ) {
        decimals = mintInfoResult.shiftMintInfo.value.data.parsed.info.decimals;
      }

      if (
        mintInfoResult.cultureMintInfo.value &&
        'parsed' in mintInfoResult.cultureMintInfo.value.data &&
        mintInfoResult.cultureMintInfo.value.data.parsed?.info?.decimals !== undefined
      ) {
        cultureDecimals = mintInfoResult.cultureMintInfo.value.data.parsed.info.decimals;
      }
    } catch {
      // Fall back to default decimals = 9
    }

    let walletBalance: number | null = null;
    let canAfford: boolean | null = null;
    let walletBalanceSol: number | null = null;
    let canAffordSol: boolean | null = null;
    let walletBalanceCulture: number | null = null;
    let canAffordCulture: boolean | null = null;

    if (wallet) {
      try {
        const walletPubkey = new PublicKey(wallet);

        const { tokenAccounts, solLamports, cultureTokenAccounts } = await runWithRpcFallback(
          async (conn) => {
            const [shiftAccounts, solBalance, cultureAccounts] = await Promise.all([
              conn.getParsedTokenAccountsByOwner(walletPubkey, { mint: shiftMintPubkey }),
              conn.getBalance(walletPubkey),
              conn.getParsedTokenAccountsByOwner(walletPubkey, { mint: cultureMintPubkey }),
            ]);
            return {
              tokenAccounts: shiftAccounts,
              solLamports: solBalance,
              cultureTokenAccounts: cultureAccounts,
            };
          },
        );

        let totalBalance = 0;
        for (const { account } of tokenAccounts.value) {
          const parsedInfo = (account.data as any).parsed?.info;
          const tokenAmount = parsedInfo?.tokenAmount;
          if (tokenAmount) {
            totalBalance += tokenAmount.uiAmount ?? 0;
          }
        }
        walletBalance = totalBalance;
        canAfford = walletBalance >= SHIFT_MINT_FEE;

        walletBalanceSol = solLamports / 1e9;
        canAffordSol = walletBalanceSol >= SOL_MINT_FEE;

        let totalCultureBalance = 0;
        for (const { account } of cultureTokenAccounts.value) {
          const parsedInfo = (account.data as any).parsed?.info;
          const tokenAmount = parsedInfo?.tokenAmount;
          if (tokenAmount) {
            totalCultureBalance += tokenAmount.uiAmount ?? 0;
          }
        }
        walletBalanceCulture = totalCultureBalance;
        canAffordCulture = walletBalanceCulture >= CULTURE_MINT_FEE;
      } catch (err: any) {
        console.error('Failed to parse wallet info using RPC fallback:', err?.message || err);
        walletBalance = null;
        canAfford = null;
        walletBalanceSol = null;
        canAffordSol = null;
        walletBalanceCulture = null;
        canAffordCulture = null;
      }
    }

    return NextResponse.json({
      feeShift: SHIFT_MINT_FEE,
      feeSol: SOL_MINT_FEE,
      feeCulture: CULTURE_MINT_FEE,
      configured,
      walletBalance,
      canAfford,
      walletBalanceSol,
      canAffordSol,
      walletBalanceCulture,
      canAffordCulture,
      treasury: SHIFT_TREASURY,
      tokenMint: SHIFT_TOKEN_MINT,
      cultureMint: CULTURE_TOKEN_MINT,
      decimals,
      cultureDecimals,
      rpcUrl: CLIENT_RPC_URL,
      payer: 'player',
      rentPayer: 'player',
      rentFeeNote: 'Player pays Solana rent fees (payer = player)',
    });
  } catch (error: unknown) {
    console.error('Unexpected error in mint-quote route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
