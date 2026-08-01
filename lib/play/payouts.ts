/**
 * Deterministic payout math shared by every game. Kept pure and
 * side-effect-free so they can be unit tested directly.
 *
 * "Total return" means the full amount credited back to the player,
 * inclusive of their original wager (i.e. what their balance increases
 * by on a win) — matching how the spec defines each payout multiple.
 */

export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Blackjack
// ---------------------------------------------------------------------------

export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'loss';

/** Total return for a settled blackjack wager (0 means the wager is lost). */
export function blackjackPayout(wager: number, outcome: BlackjackOutcome): number {
  switch (outcome) {
    case 'blackjack':
      return roundTo2(wager * 2.5);
    case 'win':
      return roundTo2(wager * 2);
    case 'push':
      return wager;
    case 'loss':
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Roulette
// ---------------------------------------------------------------------------

export type RouletteBetType =
  | 'straight'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high'
  | 'dozen1'
  | 'dozen2'
  | 'dozen3';

/** Total-return multiplier for a given European roulette bet type. */
export function rouletteMultiplier(betType: RouletteBetType): number {
  if (betType === 'straight') return 36;
  if (betType.startsWith('dozen')) return 3;
  return 2; // red/black, odd/even, low/high
}

export function roulettePayout(wager: number, betType: RouletteBetType, won: boolean): number {
  return won ? roundTo2(wager * rouletteMultiplier(betType)) : 0;
}

// ---------------------------------------------------------------------------
// Neural Crash
// ---------------------------------------------------------------------------

export const CRASH_HOUSE_EDGE = 0.96;
export const CRASH_MAX_MULTIPLIER = 50;

/** Pure function of a uniform random draw `r` in [0, 1) -> crash multiplier. */
export function crashMultiplierFromRandom(r: number): number {
  const raw = Math.max(1, Math.floor((CRASH_HOUSE_EDGE / (1 - r)) * 100) / 100);
  return Math.min(raw, CRASH_MAX_MULTIPLIER);
}

/** Draws a fresh crash point using Math.random(). */
export function generateCrashMultiplier(): number {
  return crashMultiplierFromRandom(Math.random());
}

export function crashPayout(wager: number, cashOutMultiplier: number): number {
  return roundTo2(wager * cashOutMultiplier);
}

// ---------------------------------------------------------------------------
// Six Chambers
// ---------------------------------------------------------------------------

export const CHAMBERS_TOTAL = 6;
export const CHAMBERS_HOUSE_EDGE = 0.96;

/** Multiplier after `n` consecutive safe chambers (n from 1 to 5). */
export function chambersMultiplier(n: number): number {
  if (n <= 0) return 1;
  return roundTo2((CHAMBERS_HOUSE_EDGE * CHAMBERS_TOTAL) / (CHAMBERS_TOTAL - n));
}

export function chambersPayout(wager: number, safeCount: number): number {
  return roundTo2(wager * chambersMultiplier(safeCount));
}

// ---------------------------------------------------------------------------
// Turing Bet (Human or AI)
// ---------------------------------------------------------------------------

export const TURING_BET_MULTIPLIERS = [
  1.15, 1.32, 1.55, 1.85, 2.25, 2.8, 3.6, 4.8, 6.7, 10.0,
] as const;

/** Multiplier after `correctCount` consecutive correct answers, or null past the max round. */
export function turingBetMultiplier(correctCount: number): number | null {
  if (correctCount <= 0) return null;
  const index = correctCount - 1;
  return index < TURING_BET_MULTIPLIERS.length ? TURING_BET_MULTIPLIERS[index] : null;
}

export function turingBetPayout(wager: number, correctCount: number): number {
  const multiplier = turingBetMultiplier(correctCount);
  return multiplier === null ? 0 : roundTo2(wager * multiplier);
}
