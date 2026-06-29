/**
 * POST /api/mint-card
 *
 * Verifies a SHIFT token payment transaction on Solana and records/executes the mint.
 * 1. Checks that the payment transaction exists, succeeded, and contains a token transfer
 *    of at least 500 SHIFT to the treasury wallet.
 * 2. Decodes the base64 card canvas image and uploads it to Pinata (IPFS).
 * 3. Formats card details to Metaplex metadata standard and uploads to Pinata (IPFS).
 * 4. Mints the playable NFT on-chain using Metaplex Token Metadata and transfers it
 *    directly to the user's Solana wallet.
 *
 * Request body: { signature: string, wallet: string, card: object }
 *
 * Response (success): {
 *   success: true,
 *   mintAddress: string,
 *   metadataUrl: string,
 *   imageUrl: string,
 *   signature: string
 * }
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NextResponse } from 'next/server';
import bs58 from 'bs58';
import { toMetaplexMetadata } from '@/adapters/nft-adapter.js';

const SHIFT_TOKEN_MINT = process.env.SHIFT_TOKEN_MINT || 'GG1HVvRUMeE3behg1zrXKTT3dwinGhZeWHPJekSCqiqA';
const SHIFT_TREASURY = process.env.SHIFT_TREASURY || 'CC5bjHvxKBmGsoSnCY6nyC24jDzqUcU51Vq8gwc1pv2n';
const SHIFT_MINT_FEE = Number(process.env.SHIFT_MINT_FEE) || 500;
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Utility to decode and construct the mint authority keypair.
 * Supports both standard base58 strings and JSON arrays.
 */
function getMintAuthorityKeypair(): Keypair {
  const secret = process.env.MINT_AUTHORITY_SECRET;
  if (!secret) {
    throw new Error('MINT_AUTHORITY_SECRET environment variable is not configured on the server.');
  }

  const trimmedSecret = secret.trim();

  // Try JSON array format
  if (trimmedSecret.startsWith('[')) {
    try {
      const secretBytes = Uint8Array.from(JSON.parse(trimmedSecret));
      return Keypair.fromSecretKey(secretBytes);
    } catch (e: any) {
      throw new Error(`Failed to parse MINT_AUTHORITY_SECRET as JSON array: ${e.message}`);
    }
  }

  // Try Base58 format
  try {
    const secretBytes = bs58.decode(trimmedSecret);
    return Keypair.fromSecretKey(secretBytes);
  } catch (e: any) {
    throw new Error(`Failed to decode MINT_AUTHORITY_SECRET from Base58: ${e.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { signature, wallet, card } = body as {
      signature?: string;
      wallet?: string;
      card?: Record<string, any>;
    };

    // --- Input validation ---
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "signature"' }, { status: 400 });
    }
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "wallet"' }, { status: 400 });
    }
    if (!card || typeof card !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid "card"' }, { status: 400 });
    }

    // Ensure server-side credentials are present before charging user/performing on-chain actions
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json(
        { error: 'Server configuration error: PINATA_JWT is not set.' },
        { status: 500 }
      );
    }

    let mintAuthorityKeypair: Keypair;
    try {
      mintAuthorityKeypair = getMintAuthorityKeypair();
    } catch (err: any) {
      return NextResponse.json(
        { error: `Server configuration error: ${err.message}` },
        { status: 500 }
      );
    }

    const connection = new Connection(RPC_URL, 'confirmed');

    // --- Fetch the on-chain transaction ---
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json(
        { error: 'Transaction not found. It may not be confirmed yet.' },
        { status: 402 },
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { error: 'Transaction failed on-chain', details: tx.meta.err },
        { status: 402 },
      );
    }

    // --- Verify SHIFT token transfer to treasury ---
    const preBalances = tx.meta?.preTokenBalances ?? [];
    const postBalances = tx.meta?.postTokenBalances ?? [];

    let treasuryReceived = 0;

    for (const post of postBalances) {
      const isTreasuryOwner = post.owner === SHIFT_TREASURY;
      const isShiftMint = post.mint === SHIFT_TOKEN_MINT;

      if (isTreasuryOwner && isShiftMint) {
        const postAmount = post.uiTokenAmount?.uiAmount ?? 0;

        // Find matching pre-balance for the same account index
        const pre = preBalances.find(
          (p) => p.accountIndex === post.accountIndex && p.mint === SHIFT_TOKEN_MINT,
        );
        const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;

        treasuryReceived += postAmount - preAmount;
      }
    }

    if (treasuryReceived < SHIFT_MINT_FEE) {
      return NextResponse.json(
        {
          error: `Insufficient payment. Expected at least ${SHIFT_MINT_FEE} SHIFT, but treasury received ${treasuryReceived}.`,
        },
        { status: 402 },
      );
    }

    // --- Step 1: Upload Card Image to Pinata IPFS ---
    let imageUrl = '';
    const imageDataUrl = card.imageDataUrl;

    if (typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
      try {
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([imageBuffer], { type: 'image/png' });

        const formData = new FormData();
        formData.append('file', blob, `${card.slug || 'card'}.png`);

        const pinataImageRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pinataJwt}`,
          },
          body: formData,
        });

        if (!pinataImageRes.ok) {
          const errText = await pinataImageRes.text();
          throw new Error(`Pinata image pinning failed status: ${pinataImageRes.status}. Details: ${errText}`);
        }

        const pinataImageData = await pinataImageRes.json();
        imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataImageData.IpfsHash}`;
      } catch (err: any) {
        console.error('Failed to pin card image to Pinata:', err);
        return NextResponse.json(
          { error: `IPFS Image upload failed: ${err.message}` },
          { status: 500 }
        );
      }
    } else {
      // Fallback to standard adapter resolution if no canvas base64 was passed
      imageUrl = card.images?.fullArt || card.images?.medium || '';
    }

    // --- Step 2: Format & Upload Metaplex Metadata JSON to Pinata IPFS ---
    let metadataUrl = '';
    let metaplexMetadata: any;

    try {
      metaplexMetadata = toMetaplexMetadata(card);

      // Brand all Forge-minted NFTs
      metaplexMetadata.description = 'Forged Shift Playable';

      // Inject the newly generated IPFS image URL
      if (imageUrl) {
        metaplexMetadata.image = imageUrl;
        metaplexMetadata.properties.files = [
          { uri: imageUrl, type: 'image/png' }
        ];
      }

      const metadataBody = {
        pinataContent: metaplexMetadata,
        pinataMetadata: {
          name: `${card.name || 'SHIFT Card'} Metadata`,
        },
      };

      const pinataMetaRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pinataJwt}`,
        },
        body: JSON.stringify(metadataBody),
      });

      if (!pinataMetaRes.ok) {
        const errText = await pinataMetaRes.text();
        throw new Error(`Pinata metadata JSON pinning failed status: ${pinataMetaRes.status}. Details: ${errText}`);
      }

      const pinataMetaData = await pinataMetaRes.json();
      metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataMetaData.IpfsHash}`;
    } catch (err: any) {
      console.error('Failed to pin card metadata to Pinata:', err);
      return NextResponse.json(
        { error: `IPFS Metadata upload failed: ${err.message}` },
        { status: 500 }
      );
    }

    // --- Step 3: Mint the NFT on Solana using Metaplex SDK ---
    let mintAddress = '';
    try {
      const metaplex = Metaplex.make(connection).use(keypairIdentity(mintAuthorityKeypair));
      const recipientPublicKey = new PublicKey(wallet);

      // Process creators array mapping (addresses must be PublicKeys)
      const creators = metaplexMetadata.properties?.creators?.map((c: any) => ({
        address: new PublicKey(c.address),
        share: c.share,
        verified: c.address === mintAuthorityKeypair.publicKey.toBase58(),
      })) || [
        {
          address: mintAuthorityKeypair.publicKey,
          share: 100,
          verified: true,
        }
      ];

      // Limit name length to 32 characters as per Metaplex standards
      const displayName = (card.name || 'SHIFT Card').substring(0, 32);

      const { nft } = await metaplex.nfts().create({
        uri: metadataUrl,
        name: displayName,
        sellerFeeBasisPoints: metaplexMetadata.seller_fee_basis_points ?? 500,
        symbol: 'SHIFT',
        tokenOwner: recipientPublicKey,
        creators: creators,
        isMutable: true,
      });

      mintAddress = nft.address.toBase58();
    } catch (err: any) {
      console.error('Solana on-chain NFT minting failed:', err);
      return NextResponse.json(
        { error: `On-chain NFT minting failed: ${err.message}` },
        { status: 500 }
      );
    }

    // --- Step 4: Pin a forge marker to Pinata to prevent duplicate mints ---
    const sourceNft = card.ownership?.nft || card.nftMint || '';
    if (sourceNft && pinataJwt) {
      try {
        const markerBody = {
          pinataContent: {
            sourceNft,
            mintAddress,
            wallet,
            forgedAt: new Date().toISOString(),
          },
          pinataMetadata: {
            name: `shift-forge-${sourceNft}`,
          },
        };

        await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pinataJwt}`,
          },
          body: JSON.stringify(markerBody),
        });
      } catch (markerErr) {
        // Non-fatal — mint succeeded, marker is just a convenience
        console.warn('Failed to pin forge marker:', markerErr);
      }
    }

    // Return full success details
    return NextResponse.json({
      success: true,
      mintAddress,
      metadataUrl,
      imageUrl,
      signature,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Unexpected error in mint-card route:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
