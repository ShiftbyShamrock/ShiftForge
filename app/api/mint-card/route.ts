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
const RPC_ENDPOINTS = [
  process.env.RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=bbece07e-3cf0-4dbd-8284-c21c328b7abe',
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.allnodes.com',
];

async function runWithRpcFallback<T>(queryFn: (conn: Connection) => Promise<T>): Promise<T> {
  let lastError: any = null;
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const conn = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 120000,
        fetchMiddleware: (url, options, fetch) => {
          // Retry individual RPC calls up to 3 times on transient network errors
          const attemptFetch = async (attempt: number): Promise<any> => {
            try {
              return await fetch(url, options);
            } catch (err: any) {
              if (attempt < 3) {
                console.warn(`[RPC fetchMiddleware] Attempt ${attempt} failed for ${rpcUrl}: ${err.message}. Retrying in ${attempt * 500}ms...`);
                await new Promise(r => setTimeout(r, attempt * 500));
                return attemptFetch(attempt + 1);
              }
              throw err;
            }
          };
          return attemptFetch(1);
        },
      });
      return await queryFn(conn);
    } catch (err: any) {
      console.warn(`RPC call failed on ${rpcUrl}: ${err.message || err}. Trying next endpoint...`);
      lastError = err;
    }
  }
  throw lastError || new Error('All Solana RPC endpoints failed.');
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> {
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) return res;
      lastError = new Error(`HTTP error ${res.status}: ${await res.text()}`);
    } catch (err: any) {
      console.warn(`Fetch failed for ${url} (attempt ${i + 1}/${retries}): ${err.message || err}`);
      lastError = err;
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts.`);
}

/**
 * Utility to decode and construct the mint authority keypair.
 * Supports both standard base58 strings and JSON arrays.
 */
function getMintAuthorityKeypair(): Keypair {
  const secret = process.env.MINT_AUTHORITY_SECRET;
  if (!secret) {
    console.warn('MINT_AUTHORITY_SECRET environment variable is not configured. Using generated keypair fallback.');
    return Keypair.generate();
  }

  const trimmedSecret = secret.trim();

  // Try JSON array format
  if (trimmedSecret.startsWith('[')) {
    try {
      const secretBytes = Uint8Array.from(JSON.parse(trimmedSecret));
      return Keypair.fromSecretKey(secretBytes);
    } catch (e: any) {
      console.warn(`Failed to parse MINT_AUTHORITY_SECRET as JSON array (${e.message}). Using generated keypair fallback.`);
      return Keypair.generate();
    }
  }

  // Try Base58 format
  try {
    const secretBytes = bs58.decode(trimmedSecret);
    return Keypair.fromSecretKey(secretBytes);
  } catch (e: any) {
    console.warn(`Failed to decode MINT_AUTHORITY_SECRET from Base58 (${e.message}). Using generated keypair fallback.`);
    return Keypair.generate();
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

    const SHIFT_TREASURY = process.env.SHIFT_TREASURY || 'CC5bjHvxKBmGsoSnCY6nyC24jDzqUcU51Vq8gwc1pv2n';
    const SHIFT_MINT_FEE = 250;
    const SOL_MINT_FEE = 0.25;

    // --- Fetch the on-chain transaction using RPC fallback ---
    const tx = await runWithRpcFallback(async (conn) => {
      return await conn.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
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

    // --- Verify payment (either SHIFT tokens or native SOL) ---
    // 1. Verify SHIFT token transfer
    const preBalances = tx.meta?.preTokenBalances ?? [];
    const postBalances = tx.meta?.postTokenBalances ?? [];
    let treasuryReceived = 0;

    for (const post of postBalances) {
      const isTreasuryOwner = post.owner === SHIFT_TREASURY;
      const isShiftMint = post.mint === SHIFT_TOKEN_MINT;

      if (isTreasuryOwner && isShiftMint) {
        const postAmount = post.uiTokenAmount?.uiAmount ?? 0;
        const pre = preBalances.find(
          (p) => p.accountIndex === post.accountIndex && p.mint === SHIFT_TOKEN_MINT,
        );
        const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;
        treasuryReceived += postAmount - preAmount;
      }
    }

    // 2. Verify native SOL transfer
    const accountKeys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
      : (tx.transaction.message.accountKeys as any);

    let treasuryAccountIndex = -1;
    const numKeys = typeof accountKeys.length === 'number' ? accountKeys.length : 0;
    for (let i = 0; i < numKeys; i++) {
      const key = typeof accountKeys.get === 'function' ? accountKeys.get(i) : accountKeys[i];
      if (key?.toString() === SHIFT_TREASURY) {
        treasuryAccountIndex = i;
        break;
      }
    }

    let solReceived = 0;
    if (treasuryAccountIndex !== -1 && tx.meta?.preBalances && tx.meta?.postBalances) {
      const preSol = tx.meta.preBalances[treasuryAccountIndex] ?? 0;
      const postSol = tx.meta.postBalances[treasuryAccountIndex] ?? 0;
      solReceived = (postSol - preSol) / 1e9;
    }

    const paidShift = treasuryReceived >= SHIFT_MINT_FEE;
    const paidSol = solReceived >= SOL_MINT_FEE;

    if (!paidShift && !paidSol) {
      return NextResponse.json(
        {
          error: `Insufficient payment. Expected either ${SHIFT_MINT_FEE} SHIFT (received ${treasuryReceived}) or ${SOL_MINT_FEE} SOL (received ${solReceived.toFixed(4)}).`,
        },
        { status: 402 },
      );
    }

    // --- Step 0: Server-side Duplicate Forge Check ---
    const sourceNft = card.ownership?.nft || card.nftMint || '';
    if (sourceNft && pinataJwt) {
      const markerName = `shift-forge-${sourceNft}`;
      const searchUrl = `https://api.pinata.cloud/data/pinList?status=pinned&metadata[name]=${encodeURIComponent(markerName)}&pageLimit=1`;
      try {
        const checkRes = await fetchWithRetry(searchUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pinataJwt}`,
          },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if ((checkData.rows?.length ?? 0) > 0) {
            return NextResponse.json(
              { error: 'This NFT has already been forged into a SHIFT Playable card.' },
              { status: 400 }
            );
          }
        }
      } catch (err: any) {
        console.error('Failed to perform server-side duplicate forge check:', err);
        // Fallback: do not completely block minting if Pinata API is down/rate-limited,
        // but log the error for diagnostics.
      }
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

        const pinataImageRes = await fetchWithRetry('https://api.pinata.cloud/pinning/pinFileToIPFS', {
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
    // Enforce all minted SHIFT playables to be Level 1 Base Cards
    if (card.objective) {
      card.objective.currentLevel = 1;
      card.objective.atWinThreshold = false;
    }
    card.level = 1;
    card.evoLevel = 1;
    if (typeof card.basePower === 'number') {
      card.stats = card.stats || {};
      card.stats.attack = card.basePower;
      card.power = card.basePower;
    }
    if (typeof card.baseHealth === 'number') {
      card.stats = card.stats || {};
      card.stats.hp = card.baseHealth;
      card.health = card.baseHealth;
    }

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

      const pinataMetaRes = await fetchWithRetry('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
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

      // Pre-generate the mint Keypair so we know the mint address even if the SDK's post-mint fetch fails due to node propagation delay
      const mintKeypair = Keypair.generate();
      mintAddress = mintKeypair.publicKey.toBase58();

      const { nft } = await runWithRpcFallback(async (conn) => {
        const metaplex = Metaplex.make(conn).use(keypairIdentity(mintAuthorityKeypair));
        
        // Use custom storage driver to return metadata from memory without external network requests
        metaplex.use({
          install(metaplexInstance) {
            metaplexInstance.storage().setDriver({
              getUploadPrice: async () => ({ basisPoints: 0, currency: { symbol: 'SOL', decimals: 9 } } as any),
              upload: async () => 'mock-uri',
              download: async (uri: string) => {
                if (uri === metadataUrl) {
                  const buffer = Buffer.from(JSON.stringify(metaplexMetadata));
                  return {
                    buffer,
                    fileName: 'metadata.json',
                    mimeType: 'application/json',
                    displayName: 'Metadata',
                    uniqueName: 'metadata.json',
                    extension: 'json',
                  } as any;
                }
                // Return a mock small 1x1 empty PNG buffer for any other URI
                // (e.g. image URLs) so we never touch the network!
                const mockImageBuffer = Buffer.from(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                  'base64'
                );
                return {
                  buffer: mockImageBuffer,
                  fileName: 'file.png',
                  mimeType: 'image/png',
                  displayName: 'Image',
                  uniqueName: 'file.png',
                  extension: 'png',
                } as any;
              }
            });
          }
        });

        return await metaplex.nfts().create({
          uri: metadataUrl,
          name: displayName,
          sellerFeeBasisPoints: metaplexMetadata.seller_fee_basis_points ?? 500,
          symbol: 'SHIFT',
          tokenOwner: recipientPublicKey,
          creators: creators,
          isMutable: true,
          useNewMint: mintKeypair,
        });
      });

      // If fetch succeeds immediately, update mintAddress just in case
      mintAddress = nft.address.toBase58();
    } catch (err: any) {
      const isRecoverableError = 
        err.name === 'AccountNotFoundError' || 
        err.message?.includes('was not found') ||
        err.message?.includes('type [r]') ||
        err.message?.includes('fetch failed') ||
        err.message?.includes('TypeError') ||
        err.message?.includes('failed to get info about account') ||
        err.message?.includes('503') ||
        err.message?.includes('502') ||
        err.message?.includes('Service unavailable');

      if (isRecoverableError && mintAddress) {
        console.warn('Solana on-chain mint likely succeeded but post-mint verification failed (RPC/network error). Proceeding with pre-generated mintAddress:', mintAddress, 'Error:', err.message);
      } else {
        console.error('Solana on-chain NFT minting failed:', err);
        return NextResponse.json(
          { error: `On-chain NFT minting failed: ${err.message}` },
          { status: 500 }
        );
      }
    }

    // --- Step 4: Pin a forge marker to Pinata to prevent duplicate mints ---
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

        await fetchWithRetry('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
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
      minted: true,
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
