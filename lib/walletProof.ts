/**
 * Wallet ownership proof ("Sign-In With Solana"-style) used by the Forge.
 *
 * The player signs a plain-text message with their wallet when they connect.
 * No transaction is sent and no fee is charged — it only proves that the person
 * using the site controls the private key for the wallet address.
 *
 * The server verifies the ed25519 signature with Node's built-in crypto (no extra deps).
 */

import { createPublicKey, verify } from 'crypto';
import { PublicKey } from '@solana/web3.js';

export const PROOF_HEADER = 'SHIFT Forge wallet verification';
/** A proof stays valid for 24 hours. */
export const PROOF_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Allow small clock drift between the player's device and the server. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// DER prefix for an ed25519 SubjectPublicKeyInfo; the 32-byte public key is appended.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface WalletProof {
  message: string;
  /** base64-encoded 64-byte ed25519 signature */
  signature: string;
}

export interface ProofResult {
  ok: boolean;
  error?: string;
}

/** Builds the exact message the client asks the wallet to sign. */
export function buildProofMessage(wallet: string, nonce: string, issuedAtIso: string): string {
  return [
    PROOF_HEADER,
    `Wallet: ${wallet}`,
    'Domain: shiftforge.io',
    `Nonce: ${nonce}`,
    `Issued: ${issuedAtIso}`,
    'Signing proves you own this wallet. It does not send a transaction or cost any fees.',
  ].join('\n');
}

/**
 * Verifies that `proof` is a fresh, valid signature by `wallet` over a well-formed message
 * that names that same wallet.
 */
export function verifyWalletProof(wallet: string, proof: WalletProof | undefined | null): ProofResult {
  try {
    if (!wallet || typeof wallet !== 'string') return { ok: false, error: 'Missing wallet' };
    if (!proof || typeof proof.message !== 'string' || typeof proof.signature !== 'string') {
      return { ok: false, error: 'Missing wallet verification' };
    }
    if (proof.message.length > 600) return { ok: false, error: 'Verification message too long' };

    const lines = proof.message.split('\n');
    if (lines[0] !== PROOF_HEADER) return { ok: false, error: 'Unrecognized verification message' };

    const walletLine = lines.find((l) => l.startsWith('Wallet: '));
    const issuedLine = lines.find((l) => l.startsWith('Issued: '));
    if (!walletLine || !issuedLine) return { ok: false, error: 'Malformed verification message' };
    if (walletLine.slice('Wallet: '.length).trim() !== wallet) {
      return { ok: false, error: 'Verification was signed for a different wallet' };
    }

    const issued = Date.parse(issuedLine.slice('Issued: '.length).trim());
    if (!Number.isFinite(issued)) return { ok: false, error: 'Malformed verification timestamp' };
    const now = Date.now();
    if (issued > now + FUTURE_SKEW_MS) return { ok: false, error: 'Verification timestamp is in the future' };
    if (now - issued > PROOF_MAX_AGE_MS) return { ok: false, error: 'Wallet verification expired — reconnect your wallet' };

    const sig = Buffer.from(proof.signature, 'base64');
    if (sig.length !== 64) return { ok: false, error: 'Invalid signature length' };

    const pubkeyBytes = Buffer.from(new PublicKey(wallet).toBytes());
    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, pubkeyBytes]),
      format: 'der',
      type: 'spki',
    });

    const valid = verify(null, Buffer.from(proof.message, 'utf8'), keyObject, sig);
    return valid ? { ok: true } : { ok: false, error: 'Signature does not match this wallet' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Verification failed' };
  }
}
