/**
 * Pure blackjack rules engine: deck construction, hand values, and dealer
 * behavior. No React, no randomness injected from outside (deck shuffling
 * uses Math.random directly, same as every other game's demo RNG).
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Card = { rank: Rank; suit: Suit };

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RED_SUITS = new Set<Suit>(['H', 'D']);

/** Builds a shuffled multi-deck shoe. Six decks keeps card-counting irrelevant for a demo. */
export function createShoe(deckCount = 6): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export type HandValue = { total: number; soft: boolean };

/** Best hand total <= 21 where possible, downgrading aces from 11 to 1 as needed. */
export function handValue(cards: Card[]): HandValue {
  let total = cards.reduce((sum, c) => sum + rankValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  // "Soft" means at least one ace is still counted as 11.
  const soft = cards.some((c) => c.rank === 'A') && aces > 0;
  return { total, soft };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}

/** Dealer hits on anything below 17, stands on 17 (hard or soft). */
export function dealerShouldHit(cards: Card[]): boolean {
  return handValue(cards).total < 17;
}

export type BlackjackResult = 'player-blackjack' | 'dealer-blackjack' | 'push' | 'win' | 'loss';

export function resolveHands(playerCards: Card[], dealerCards: Card[]): BlackjackResult {
  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = isBlackjack(dealerCards);
  if (playerBJ && dealerBJ) return 'push';
  if (playerBJ) return 'player-blackjack';
  if (dealerBJ) return 'dealer-blackjack';
  if (isBust(playerCards)) return 'loss';
  if (isBust(dealerCards)) return 'win';
  const player = handValue(playerCards).total;
  const dealer = handValue(dealerCards).total;
  if (player > dealer) return 'win';
  if (player < dealer) return 'loss';
  return 'push';
}
