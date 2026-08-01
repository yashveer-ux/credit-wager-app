import type {
  Achievement,
  CheckInDay,
  Cosmetic,
  Milestone,
  Mission,
  WeeklyChallenge,
} from './types';

/** Level thresholds — XP required to reach each level, index = level. */
export const LEVEL_TITLES = [
  '',
  'Newcomer',
  'Regular',
  'Contender',
  'Rising Star',
  'High Roller',
  'Veteran',
  'Elite',
  'Master',
  'Grandmaster',
  'Legend',
];

export const XP_PER_LEVEL = 1000;

export const CHECK_IN_DAYS: CheckInDay[] = [
  { day: 1, label: 'Mon', rewardTokens: 50 },
  { day: 2, label: 'Tue', rewardTokens: 75 },
  { day: 3, label: 'Wed', rewardTokens: 100 },
  { day: 4, label: 'Thu', rewardTokens: 150 },
  { day: 5, label: 'Fri', rewardTokens: 200 },
  { day: 6, label: 'Sat', rewardTokens: 300 },
  { day: 7, label: 'Sun', rewardTokens: 500 },
];

/** 0-indexed position within CHECK_IN_DAYS representing "today". */
export const TODAY_INDEX = 4;
/** How many of the days before today are already claimed (streak so far). */
export const INITIAL_CLAIMED_DAYS = 4;

export const MISSIONS: Mission[] = [
  {
    id: 'mission-play-3',
    title: 'Play 3 rounds',
    icon: 'game-controller',
    target: 3,
    progress: 3,
    rewardTokens: 100,
  },
  {
    id: 'mission-blackjack-win',
    title: 'Win a Blackjack hand',
    icon: 'card',
    target: 1,
    progress: 0,
    rewardTokens: 150,
  },
  {
    id: 'mission-wager-500',
    title: 'Wager 500 tokens total',
    icon: 'cash',
    target: 500,
    progress: 320,
    rewardTokens: 120,
  },
  {
    id: 'mission-try-2-games',
    title: 'Try 2 different games',
    icon: 'shuffle',
    target: 2,
    progress: 2,
    rewardTokens: 80,
  },
];

export const MISSIONS_INITIAL_CLAIMED: string[] = ['mission-try-2-games'];

export const WEEKLY_CHALLENGES: WeeklyChallenge[] = [
  {
    id: 'weekly-crash-5x',
    title: 'Ride a 5x multiplier in Crash',
    description: 'Cash out at 5.00× or higher in a single Crash round.',
    icon: 'trending-up',
    target: 1,
    progress: 0,
    rewardTokens: 500,
  },
  {
    id: 'weekly-win-10',
    title: 'Win 10 games this week',
    description: 'Any game, any wager — just take the win.',
    icon: 'trophy',
    target: 10,
    progress: 10,
    rewardTokens: 750,
  },
  {
    id: 'weekly-all-games',
    title: 'Play all 5 games',
    description: 'Try every game on the Play tab at least once.',
    icon: 'apps',
    target: 5,
    progress: 5,
    rewardTokens: 1000,
    requiresLevel: 5,
  },
];

export const WEEKLY_INITIAL_CLAIMED: string[] = [];

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-first-blackjack',
    title: 'First Blackjack Win',
    description: 'Win your first hand of Blackjack.',
    icon: 'ribbon',
    unlocked: true,
  },
  {
    id: 'ach-crash-10x',
    title: 'Survive a 10x Crash',
    description: 'Cash out at 10.00× or higher in Crash.',
    icon: 'flame',
    unlocked: false,
  },
  {
    id: 'ach-turing-perfect',
    title: 'Perfect Turing Bet Run',
    description: 'Correctly guess Human or AI 5 times in a row.',
    icon: 'hardware-chip',
    unlocked: false,
  },
  {
    id: 'ach-high-roller',
    title: 'High Roller',
    description: 'Wager 1,000 AI Tokens in total.',
    icon: 'diamond',
    unlocked: true,
  },
  {
    id: 'ach-winning-streak',
    title: 'Winning Streak',
    description: 'Win 5 games in a row.',
    icon: 'flash',
    unlocked: false,
  },
  {
    id: 'ach-game-explorer',
    title: 'Game Explorer',
    description: 'Try all 5 games on the Play tab.',
    icon: 'compass',
    unlocked: true,
  },
];

export const MILESTONES: Milestone[] = [
  { id: 'milestone-10', title: 'Play 10 games', target: 10, rewardTokens: 100, statKey: 'gamesPlayed' },
  { id: 'milestone-50', title: 'Play 50 games', target: 50, rewardTokens: 300, statKey: 'gamesPlayed' },
  { id: 'milestone-100', title: 'Play 100 games', target: 100, rewardTokens: 750, statKey: 'gamesPlayed' },
  { id: 'milestone-250', title: 'Play 250 games', target: 250, rewardTokens: 2000, statKey: 'gamesPlayed' },
];

export const MILESTONE_INITIAL_CLAIMED: string[] = ['milestone-10'];

/** Mock cumulative lifetime stat used to evaluate milestones. */
export const MOCK_STATS = { gamesPlayed: 62 };

export const COSMETICS: Cosmetic[] = [
  { id: 'cosmetic-bronze-frame', name: 'Bronze Frame', kind: 'frame', color: '#B08D57', icon: 'ellipse-outline' },
  { id: 'cosmetic-silver-frame', name: 'Silver Frame', kind: 'frame', color: '#9BA4B4', icon: 'ellipse-outline' },
  { id: 'cosmetic-gold-frame', name: 'Gold Frame', kind: 'frame', color: '#E4B93F', icon: 'ellipse-outline', requiresLevel: 10 },
  { id: 'cosmetic-neon-accent', name: 'Neon Accent', kind: 'accent', color: '#1B5CFF', icon: 'color-palette' },
  { id: 'cosmetic-diamond-frame', name: 'Diamond Frame', kind: 'frame', color: '#5FD3E0', icon: 'ellipse-outline', requiresLevel: 12 },
];

export const COSMETICS_INITIAL_OWNED: string[] = ['cosmetic-bronze-frame'];
export const COSMETICS_INITIAL_SELECTED = 'cosmetic-bronze-frame';
