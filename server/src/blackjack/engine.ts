import { randomInt } from 'node:crypto';

/**
 * Blackjack rules. Pure and deterministic — no DB, no network, no clocks.
 * The only randomness lives in shuffle(), which is cryptographically secure.
 *
 * House rules encoded here:
 * - dealer draws below 17 and stands on ALL 17s, soft included
 * - blackjack (a two-card 21) pays 3:2
 * - double down only on the first two cards, one card, then forced stand
 * - no splits, no insurance, no surrender
 */

/** Two-char code: rank then suit, e.g. 'AS', 'TD' ('T' is ten), '9H'. */
export type Card = string;

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const SUITS = ['S', 'H', 'D', 'C'] as const;

export type Action = 'hit' | 'stand' | 'double';
export type HandOutcome = 'WIN' | 'LOSS' | 'PUSH' | 'BLACKJACK' | 'BUST';

/** A fresh unshuffled shoe of `decks` 52-card decks. */
export function newShoe(decks = 6): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const r of RANKS) cards.push(r + s);
  }
  return cards;
}

/** In-place Fisher-Yates using node:crypto randomInt. Returns the same array. */
export function shuffle<T>(cards: T[]): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function rankValue(card: Card): number {
  const r = card[0];
  if (r === 'A') return 1;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  const n = Number(r);
  if (!Number.isInteger(n) || n < 2 || n > 9) throw new Error(`bad card: ${card}`);
  return n;
}

/**
 * Best hand value. Aces count 1 each; ONE ace is promoted to 11 when that
 * still fits under 22 (two elevens can never fit). `soft` means an ace is
 * currently counted as 11.
 */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += rankValue(c);
    if (c[0] === 'A') aces++;
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

export const isBust = (cards: Card[]): boolean => handValue(cards).total > 21;

/** A natural: exactly two cards totalling 21. A drawn-to 21 is not blackjack. */
export const isBlackjack = (cards: Card[]): boolean =>
  cards.length === 2 && handValue(cards).total === 21;

/** Dealer draws below 17, stands on all 17s (soft 17 included). */
export const dealerShouldDraw = (cards: Card[]): boolean => handValue(cards).total < 17;

/** Legal actions for a hand. Empty array means the hand is done (21, bust, or doubled). */
export function legalActions(cards: Card[], doubled: boolean): Action[] {
  if (doubled || handValue(cards).total >= 21) return [];
  const actions: Action[] = ['hit', 'stand'];
  if (cards.length === 2) actions.push('double');
  return actions;
}

/** Outcome for one player hand against the dealer's final cards. */
export function settleHand(player: Card[], dealer: Card[]): HandOutcome {
  if (isBust(player)) return 'BUST'; // a bust loses even when the dealer busts too
  const playerBj = isBlackjack(player);
  const dealerBj = isBlackjack(dealer);
  if (playerBj) return dealerBj ? 'PUSH' : 'BLACKJACK'; // natural beats a drawn 21
  if (dealerBj) return 'LOSS';
  if (isBust(dealer)) return 'WIN';
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  return p > d ? 'WIN' : p < d ? 'LOSS' : 'PUSH';
}

/**
 * Total returned to the player (stake included) from the TOTAL staked on the
 * hand — a doubled hand passes 2x its original wager in.
 * WIN 2x, BLACKJACK 2.5x (3:2, floored toward the house), PUSH 1x, LOSS/BUST 0.
 */
export function payoutFor(outcome: HandOutcome, totalWager: bigint): bigint {
  if (totalWager <= 0n) throw new Error(`wager must be positive: ${totalWager}`);
  switch (outcome) {
    case 'WIN':
      return totalWager * 2n;
    case 'BLACKJACK':
      return (totalWager * 5n) / 2n;
    case 'PUSH':
      return totalWager;
    case 'LOSS':
    case 'BUST':
      return 0n;
  }
}
