import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(
  process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

/**
 * Verify that a wallet owns a specific NFT on Solana.
 *
 * POST /api/verify
 * Body: { walletAddress: string, mintAddress: string }
 * Returns: { owns: boolean }
 */
export async function POST(req: Request) {
  try {
    const { walletAddress, mintAddress } = await req.json();

    if (!walletAddress || !mintAddress) {
      return NextResponse.json(
        { error: 'walletAddress and mintAddress are required' },
        { status: 400 }
      );
    }

    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(mintAddress);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet,
      { mint }
    );

    if (tokenAccounts.value.length === 0) {
      return NextResponse.json({ owns: false });
    }

    const amount =
      tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;

    return NextResponse.json({ owns: amount >= 1 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
