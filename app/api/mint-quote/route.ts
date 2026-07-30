/**
 * POST /api/mint-quote
 *
 * Returns the mint fee quote for all payment methods (SOL, SHIFT, CULTURE SHIFT).
 * If a wallet address is provided, queries the Solana RPC for the wallet's
 * balances and calculates whether the wallet can afford each mint fee.
 *
 * Request body: { wallet?: string }
 *
 * Response: {
 *   feeShift: number,
 *   feeSol: number,
 *   feeCulture: number,
 *   configured: boolean,
 *   walletBalance: number | null,
 *   canAfford: boolean | null,
 *   walletBalanceSol: number | null,
 *   canAffordSol: boolean | null,
 *   walletBalanceCulture: number | null,
 *   canAffordCulture: boolean | null,
 *   treasury: string,
 *   tokenMint: string,
 *   cultureMint: string,
 *   decimals: number,
 *   cultureDecimals: number,
 *   rpcUrl: string
 * }
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';

const SHIFT_TOKEN_MINT = process.env.SHIFT_TOKEN_MINT || 'GG1HVvRUMeE3behg1zrXKTT3dwinGhZeWHPJekSCqiqA';
const CULTURE_TOKEN_MINT = 'BtpQ3WZsA5rpA45iNWxQJ9djSurnXhrDYMYnyNc1LDrK';
const SHIFT_TREASURY = process.env.SHIFT_TREASURY || 'CC5bjHvxKBmGsoSnCY6nyC24jDzqUcU51Vq8gwc1pv2n';
const SHIFT_MINT_FEE = 250;
const SOL_MINT_FEE = 0.25;
const CULTURE_MINT_FEE = 2500000;
const RPC_URL = process.env.RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=bbece07e-3cf0-4dbd-8284-c21c328b7abe';
const RPC_ENDPOINTS = [
  RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.allnodes.com',
];

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
    const body = await request.json().catch(() => ({}));
    const { wallet } = body as { wallet?: string };

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

        // Fetch native SOL balance and token accounts for SHIFT + CULTURE using resilient RPC fallback
        const result = await runWithRpcFallback(async (conn) => {
          const [solBalance, shiftAccounts, cultureAccounts] = await Promise.all([
            conn.getBalance(walletPubkey),
            conn.getParsedTokenAccountsByOwner(walletPubkey, { mint: shiftMintPubkey }),
            conn.getParsedTokenAccountsByOwner(walletPubkey, { mint: cultureMintPubkey }),
          ]);
          return { solBalance, shiftAccounts, cultureAccounts };
        });

        walletBalanceSol = result.solBalance / 1e9;
        canAffordSol = walletBalanceSol >= SOL_MINT_FEE;

        // SHIFT balance
        walletBalance = 0;
        for (const { account } of result.shiftAccounts.value) {
          const parsed = account.data.parsed;
          const amount = parsed?.info?.tokenAmount?.uiAmount ?? 0;
          walletBalance += amount;
        }
        canAfford = walletBalance >= SHIFT_MINT_FEE;

        // CULTURE SHIFT balance
        walletBalanceCulture = 0;
        for (const { account } of result.cultureAccounts.value) {
          const parsed = account.data.parsed;
          const amount = parsed?.info?.tokenAmount?.uiAmount ?? 0;
          walletBalanceCulture += amount;
        }
        canAffordCulture = walletBalanceCulture >= CULTURE_MINT_FEE;
      } catch (err: any) {
        console.error('Failed to parse wallet info using RPC fallback:', err);
        // Wallet query failed — return nulls
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
      rpcUrl: RPC_URL,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
