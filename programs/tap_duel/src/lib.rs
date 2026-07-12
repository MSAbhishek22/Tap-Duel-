use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

declare_id!("TapDue1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

pub const MATCH_SEED: &[u8] = b"match";
pub const MATCH_DURATION: i64 = 15; // 15 seconds

#[ephemeral]
#[program]
pub mod tap_duel {
    use super::*;

    /// Create a new match. The creator becomes player 1.
    pub fn create_match(ctx: Context<CreateMatch>, match_id: u64) -> Result<()> {
        let game_match = &mut ctx.accounts.game_match;
        game_match.match_id = match_id;
        game_match.player1 = ctx.accounts.player.key();
        game_match.player2 = Pubkey::default();
        game_match.score1 = 0;
        game_match.score2 = 0;
        game_match.start_time = 0;
        game_match.status = MatchStatus::WaitingForPlayer as u8;
        msg!("Match {} created by {}", match_id, ctx.accounts.player.key());
        Ok(())
    }

    /// Join an existing match as player 2. Starts the match timer.
    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        let game_match = &mut ctx.accounts.game_match;
        require!(
            game_match.status == MatchStatus::WaitingForPlayer as u8,
            TapDuelError::MatchNotJoinable
        );
        require!(
            game_match.player1 != ctx.accounts.player.key(),
            TapDuelError::CannotJoinOwnMatch
        );
        game_match.player2 = ctx.accounts.player.key();
        let clock = Clock::get()?;
        game_match.start_time = clock.unix_timestamp;
        game_match.status = MatchStatus::Active as u8;
        msg!("Player {} joined match {}", ctx.accounts.player.key(), game_match.match_id);
        Ok(())
    }

    /// Tap! Increment the calling player's score by 1.
    /// This runs on the Ephemeral Rollup for near-instant execution.
    pub fn tap(ctx: Context<Tap>) -> Result<()> {
        let game_match = &mut ctx.accounts.game_match;
        require!(
            game_match.status == MatchStatus::Active as u8,
            TapDuelError::MatchNotActive
        );

        // Check if match time has expired
        let clock = Clock::get()?;
        if clock.unix_timestamp - game_match.start_time >= MATCH_DURATION {
            game_match.status = MatchStatus::Ended as u8;
            return Ok(());
        }

        let player = ctx.accounts.player.key();
        if player == game_match.player1 {
            game_match.score1 += 1;
            msg!("P1 tap! Score: {}", game_match.score1);
        } else if player == game_match.player2 {
            game_match.score2 += 1;
            msg!("P2 tap! Score: {}", game_match.score2);
        } else {
            return Err(TapDuelError::NotAPlayer.into());
        }
        Ok(())
    }

    /// End the match and determine the winner.
    pub fn end_match(ctx: Context<EndMatch>) -> Result<()> {
        let game_match = &mut ctx.accounts.game_match;
        require!(
            game_match.status == MatchStatus::Active as u8,
            TapDuelError::MatchNotActive
        );
        game_match.status = MatchStatus::Ended as u8;
        msg!(
            "Match {} ended! P1: {} taps, P2: {} taps. Winner: {}",
            game_match.match_id,
            game_match.score1,
            game_match.score2,
            if game_match.score1 > game_match.score2 {
                game_match.player1.to_string()
            } else if game_match.score2 > game_match.score1 {
                game_match.player2.to_string()
            } else {
                "TIE".to_string()
            }
        );
        Ok(())
    }

    /// Delegate the match account to the MagicBlock Ephemeral Rollup.
    pub fn delegate_match(ctx: Context<DelegateMatch>, match_id: u64) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[MATCH_SEED, &match_id.to_le_bytes()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        msg!("Match {} delegated to ER", match_id);
        Ok(())
    }

    /// Commit the match state back to Solana base layer.
    pub fn commit_match(ctx: Context<CommitMatch>) -> Result<()> {
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.game_match.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// Undelegate the match account (commit final state + return ownership).
    pub fn undelegate_match(ctx: Context<CommitMatch>) -> Result<()> {
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.game_match.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

// === Account Structs ===

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct CreateMatch<'info> {
    #[account(
        init,
        payer = player,
        space = 8 + GameMatch::INIT_SPACE,
        seeds = [MATCH_SEED, &match_id.to_le_bytes()],
        bump
    )]
    pub game_match: Account<'info, GameMatch>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub game_match: Account<'info, GameMatch>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct Tap<'info> {
    #[account(mut)]
    pub game_match: Account<'info, GameMatch>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct EndMatch<'info> {
    #[account(mut)]
    pub game_match: Account<'info, GameMatch>,
    pub player: Signer<'info>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct DelegateMatch<'info> {
    pub payer: Signer<'info>,
    /// CHECK: The match PDA to delegate
    #[account(mut, del)]
    pub pda: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub game_match: Account<'info, GameMatch>,
}

// === Data Structs ===

#[account]
#[derive(InitSpace)]
pub struct GameMatch {
    pub match_id: u64,     // 8
    pub player1: Pubkey,   // 32
    pub player2: Pubkey,   // 32
    pub score1: u64,       // 8
    pub score2: u64,       // 8
    pub start_time: i64,   // 8
    pub status: u8,        // 1
}

#[repr(u8)]
pub enum MatchStatus {
    WaitingForPlayer = 0,
    Active = 1,
    Ended = 2,
}

#[error_code]
pub enum TapDuelError {
    #[msg("Match is not in a joinable state")]
    MatchNotJoinable,
    #[msg("Cannot join your own match")]
    CannotJoinOwnMatch,
    #[msg("Match is not active")]
    MatchNotActive,
    #[msg("You are not a player in this match")]
    NotAPlayer,
}
