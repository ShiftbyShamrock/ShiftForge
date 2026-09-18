use anchor_lang::prelude::*;

declare_id!("SHiFTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod shift {
    use super::*;

    /// Initialize a new match room on-chain.
    /// Anchor account constraint: #[account(init, payer = player, ...)]
    /// Verifies the player's wallet is the signer and payer, paying the Solana rent fees.
    pub fn init_match(
        ctx: Context<InitMatch>,
        room_code: String,
        deck_mints: Vec<Pubkey>,
    ) -> Result<()> {
        let match_account = &mut ctx.accounts.match_account;
        let player = &ctx.accounts.player;

        match_account.room_code = room_code.clone();
        match_account.player1 = player.key();
        match_account.player2 = None;
        match_account.turn = 1;
        match_account.phase = 0; // Draw
        match_account.player1_hp = 20;
        match_account.player2_hp = 20;
        match_account.player1_mana = 1;
        match_account.player2_mana = 0;
        match_account.status = 0; // Waiting
        match_account.winner = None;
        match_account.last_move_slot = Clock::get()?.slot;
        match_account.bump = ctx.bumps.match_account;

        msg!(
            "InitMatch: Room {} initialized. Payer/Player1: {}. Solana rent funded by player.",
            room_code,
            player.key()
        );

        Ok(())
    }

    /// Opponent joins an existing match
    pub fn join_match(ctx: Context<JoinMatch>, _deck_mints: Vec<Pubkey>) -> Result<()> {
        let match_account = &mut ctx.accounts.match_account;
        let opponent = &ctx.accounts.opponent;

        require!(match_account.status == 0, ShiftError::RoomFull);
        require!(match_account.player2.is_none(), ShiftError::RoomFull);

        match_account.player2 = Some(opponent.key());
        match_account.status = 1; // Active

        msg!("JoinMatch: Opponent {} joined room {}", opponent.key(), match_account.room_code);
        Ok(())
    }

    /// Submit a signed duel action
    pub fn submit_move(
        ctx: Context<SubmitMove>,
        move_type: u8,
        slot_index: u8,
        target_slot: u8,
        _card_mint: Option<Pubkey>,
    ) -> Result<()> {
        let match_account = &mut ctx.accounts.match_account;
        require!(match_account.status == 1, ShiftError::MatchNotActive);
        match_account.last_move_slot = Clock::get()?.slot;
        msg!("SubmitMove: type={}, slot={}, target={}", move_type, slot_index, target_slot);
        Ok(())
    }

    /// Claim victory and close match account
    pub fn claim_victory(ctx: Context<ClaimVictory>) -> Result<()> {
        let match_account = &mut ctx.accounts.match_account;
        let winner = &ctx.accounts.winner;
        match_account.status = 2; // Finished
        match_account.winner = Some(winner.key());
        msg!("ClaimVictory: Winner {} for room {}", winner.key(), match_account.room_code);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(room_code: String, deck_mints: Vec<Pubkey>)]
pub struct InitMatch<'info> {
    /// MatchAccount PDA initialized with (payer = player).
    /// The player's connected wallet pays the Solana rent-exemption fee for this account.
    #[account(
        init,
        payer = player,
        space = 8 + MatchAccount::INIT_SPACE,
        seeds = [b"match", room_code.as_bytes()],
        bump
    )]
    pub match_account: Account<'info, MatchAccount>,

    /// Player's wallet is verified as the signer and fee payer (payer = player).
    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.room_code.as_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, MatchAccount>,

    #[account(mut)]
    pub opponent: Signer<'info>,
}

#[derive(Accounts)]
pub struct SubmitMove<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.room_code.as_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, MatchAccount>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimVictory<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.room_code.as_bytes()],
        bump = match_account.bump,
        close = winner
    )]
    pub match_account: Account<'info, MatchAccount>,

    #[account(mut)]
    pub winner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct MatchAccount {
    #[max_len(32)]
    pub room_code: String,
    pub player1: Pubkey,
    pub player2: Option<Pubkey>,
    pub turn: u32,
    pub phase: u8,
    pub player1_hp: u8,
    pub player2_hp: u8,
    pub player1_mana: u8,
    pub player2_mana: u8,
    pub status: u8,
    pub winner: Option<Pubkey>,
    pub last_move_slot: u64,
    pub bump: u8,
}

#[error_code]
pub enum ShiftError {
    #[msg("It is not your turn.")]
    NotPlayerTurn,
    #[msg("This move is not valid in the current phase.")]
    InvalidMove,
    #[msg("This room already has two players.")]
    RoomFull,
    #[msg("You do not own this NFT card.")]
    CardNotOwned,
    #[msg("The match has not started or is already over.")]
    MatchNotActive,
    #[msg("Not enough mana to play this card.")]
    InsufficientMana,
}
