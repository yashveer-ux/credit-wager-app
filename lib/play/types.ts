/**
 * Shared types for the Play (casino lobby) feature.
 *
 * Everything here operates on fictional "AI Tokens" — a demo-only currency
 * with no real-world value, distinct from the SIM_* credit types in `lib/mock.ts`.
 */

export type GameId = 'blackjack' | 'roulette' | 'crash' | 'chambers' | 'human-or-ai';

export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export type GameMeta = {
  id: GameId;
  route: string;
  name: string;
  tagline: string;
  description: string;
  risk: RiskLevel;
  minWager: number;
  maxMultiplierLabel: string;
  icon: string;
  accent: string;
  accentSoft: string;
};

export type RoundOutcome = 'win' | 'loss' | 'push';

export type PlayHistoryEntry = {
  id: string;
  gameId: GameId;
  label: string;
  wager: number;
  delta: number;
  balanceAfter: number;
  createdAt: string;
};
