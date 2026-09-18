/**
 * @fileoverview Anchor Program Adapter for SHIFT On-Chain Match System
 *
 * Enforces Anchor account constraints: (payer = player).
 * Verifies that the player's/Mint wallet is the payer in the initMatch instruction.
 * Ensures player wallet pays the Solana rent-exemption fees for the MatchAccount PDA.
 *
 * @module anchor-adapter
 * @version 1.0.0
 */

import { PublicKey, TransactionInstruction, Transaction, SystemProgram } from "@solana/web3.js";

export const SHIFT_PROGRAM_ID = new PublicKey("SHiFTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

/**
 * Anchor IDL definition for SHIFT program initMatch instruction
 * Constraint: #[account(init, payer = player, space = 8 + MatchAccount::INIT_SPACE, seeds = [b"match", room_code.as_bytes()], bump)]
 */
export const SHIFT_IDL = {
  version: "0.1.0",
  name: "shift",
  instructions: [
    {
      name: "initMatch",
      docs: [
        "Initialize a new duel MatchAccount on-chain.",
        "Anchor account constraint: #[account(init, payer = player, space = 8 + MatchAccount::INIT_SPACE, seeds = [b\"match\", room_code.as_bytes()], bump)]",
        "The player's connected wallet is the payer (payer = player) and pays Solana rent-exemption fees."
      ],
      accounts: [
        {
          name: "matchAccount",
          isMut: true,
          isSigner: false,
          docs: ["MatchAccount PDA initialized on-chain. Solana rent fee paid by player."]
        },
        {
          name: "player",
          isMut: true,
          isSigner: true,
          docs: ["Player signer and fee payer (payer = player). Pays Solana rent fees."]
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false,
          docs: ["Solana System Program required for account creation and rent funding."]
        }
      ],
      args: [
        { name: "roomCode", type: "string" },
        { name: "deckMints", type: { vec: "publicKey" } }
      ]
    }
  ]
};

/**
 * Derives the MatchAccount PDA on Solana using seeds [b"match", roomCode.as_bytes()]
 * @param {string} roomCode
 * @returns {Promise<{ pda: PublicKey, bump: number }>}
 */
export async function getMatchPDA(roomCode) {
  const [pda, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("match"), Buffer.from(roomCode)],
    SHIFT_PROGRAM_ID
  );
  return { pda, bump };
}

/**
 * Builds the Anchor initMatch instruction verifying (payer = player).
 *
 * @param {Object} params
 * @param {PublicKey|string} params.playerPubkey - Player / Mint wallet (must be payer and signer)
 * @param {string} params.roomCode - Room code identifier
 * @param {Array<PublicKey|string>} [params.deckMints] - Mint pubkeys of the player's cards
 * @returns {Promise<{ instruction: TransactionInstruction, matchPDA: PublicKey, payerPubkey: PublicKey }>}
 */
export async function buildInitMatchInstruction({ playerPubkey, roomCode, deckMints = [] }) {
  if (!playerPubkey) {
    throw new Error("Missing playerPubkey: Player's wallet must be provided as payer (payer = player).");
  }

  const payer = typeof playerPubkey === "string" ? new PublicKey(playerPubkey) : playerPubkey;
  const { pda: matchPDA } = await getMatchPDA(roomCode);

  // Anchor method discriminator: sha256("global:init_match")[0..8]
  const discriminator = Buffer.from([0xa8, 0x49, 0x6e, 0x1e, 0x3a, 0x8d, 0x27, 0x91]);
  const roomCodeBuffer = Buffer.from(roomCode, "utf8");
  const roomCodeLength = Buffer.alloc(4);
  roomCodeLength.writeUInt32LE(roomCodeBuffer.length, 0);

  const mintPubkeys = (deckMints || []).map((m) => {
    try {
      return typeof m === "string" ? new PublicKey(m) : m;
    } catch {
      return SystemProgram.programId;
    }
  });

  const mintsCount = Buffer.alloc(4);
  mintsCount.writeUInt32LE(mintPubkeys.length, 0);
  const mintsBuffer = Buffer.concat(mintPubkeys.map((m) => m.toBuffer()));

  const data = Buffer.concat([discriminator, roomCodeLength, roomCodeBuffer, mintsCount, mintsBuffer]);

  // Account constraints:
  // 1. match_account: init, payer = player
  // 2. player: Signer, mut (fee payer)
  // 3. system_program: Program<'info, System>
  const instruction = new TransactionInstruction({
    programId: SHIFT_PROGRAM_ID,
    keys: [
      { pubkey: matchPDA, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true }, // payer = player
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { instruction, matchPDA, payerPubkey: payer };
}
