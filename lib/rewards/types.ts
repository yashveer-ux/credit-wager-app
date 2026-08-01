/**
 * Types for the Rewards feature. All data is local/mock — no backend, no
 * persistence required. See `lib/rewards/mockData.ts` for seed data and
 * `lib/rewards/store.ts` for the stateful hook that drives `rewards.tsx`.
 */

import type { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Shared visual/interaction state for anything with a claim button. */
export type ClaimState = 'claimable' | 'claimed' | 'locked' | 'in-progress';

export type CheckInDayState = 'claimed' | 'today' | 'locked';

export interface CheckInDay {
  day: number;
  label: string;
  rewardTokens: number;
}

export interface Mission {
  id: string;
  title: string;
  icon: IconName;
  target: number;
  progress: number;
  rewardTokens: number;
  /** Missions can be gated behind a level requirement (locked state). */
  requiresLevel?: number;
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  target: number;
  progress: number;
  rewardTokens: number;
  requiresLevel?: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  unlocked: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  target: number;
  rewardTokens: number;
  /** Which mock cumulative stat this milestone tracks. */
  statKey: 'gamesPlayed';
}

export type CosmeticKind = 'frame' | 'accent';

export interface Cosmetic {
  id: string;
  name: string;
  kind: CosmeticKind;
  color: string;
  icon: IconName;
  requiresLevel?: number;
}
