/**
 * Local state for the Rewards screen. Everything here is in-memory only
 * (component-level useState via a single custom hook) — no persistence, no
 * backend, no cross-screen store. The only real side effect is crediting the
 * app's actual AI Token balance via the unified ledger's `applyAndRecord`
 * when a token reward is claimed, so every claim both moves the balance and
 * shows up as a history entry elsewhere in the app.
 */

import { useCallback, useMemo, useState } from 'react';

import { applyAndRecord } from '../ledger/ledgerStore';
import {
  ACHIEVEMENTS,
  CHECK_IN_DAYS,
  COSMETICS,
  COSMETICS_INITIAL_OWNED,
  COSMETICS_INITIAL_SELECTED,
  INITIAL_CLAIMED_DAYS,
  LEVEL_TITLES,
  MILESTONES,
  MILESTONE_INITIAL_CLAIMED,
  MISSIONS,
  MISSIONS_INITIAL_CLAIMED,
  MOCK_STATS,
  TODAY_INDEX,
  WEEKLY_CHALLENGES,
  WEEKLY_INITIAL_CLAIMED,
  XP_PER_LEVEL,
} from './mockData';
import type { Achievement, ClaimState, CheckInDayState, Cosmetic, Milestone, Mission, WeeklyChallenge } from './types';

const INITIAL_LEVEL = 4;
const INITIAL_XP_INTO_LEVEL = 650;
/** XP granted per reward claim = rewardTokens / XP_PER_TOKEN_DIVISOR (rounded, min 5). */
const XP_PER_TOKEN_DIVISOR = 10;

export interface CheckInDayView {
  day: number;
  label: string;
  rewardTokens: number;
  state: CheckInDayState;
}

export interface MissionView extends Mission {
  claimState: ClaimState;
}

export interface WeeklyChallengeView extends WeeklyChallenge {
  claimState: ClaimState;
}

export interface MilestoneView extends Milestone {
  progress: number;
  claimState: ClaimState;
}

export interface CosmeticView extends Cosmetic {
  claimState: ClaimState;
  owned: boolean;
  selected: boolean;
}

export function useRewards() {
  const [level, setLevel] = useState(INITIAL_LEVEL);
  const [xpIntoLevel, setXpIntoLevel] = useState(INITIAL_XP_INTO_LEVEL);

  const [claimedDayCount] = useState(INITIAL_CLAIMED_DAYS);
  const [todayClaimed, setTodayClaimed] = useState(false);

  const [missionState] = useState(MISSIONS);
  const [claimedMissionIds, setClaimedMissionIds] = useState<Set<string>>(
    () => new Set(MISSIONS_INITIAL_CLAIMED)
  );

  const [weeklyState] = useState(WEEKLY_CHALLENGES);
  const [claimedWeeklyIds, setClaimedWeeklyIds] = useState<Set<string>>(
    () => new Set(WEEKLY_INITIAL_CLAIMED)
  );

  const [claimedMilestoneIds, setClaimedMilestoneIds] = useState<Set<string>>(
    () => new Set(MILESTONE_INITIAL_CLAIMED)
  );

  const [ownedCosmeticIds, setOwnedCosmeticIds] = useState<Set<string>>(
    () => new Set(COSMETICS_INITIAL_OWNED)
  );
  const [selectedCosmeticId, setSelectedCosmeticId] = useState(COSMETICS_INITIAL_SELECTED);

  const grantXp = useCallback((rewardTokens: number) => {
    const gained = Math.max(5, Math.round(rewardTokens / XP_PER_TOKEN_DIVISOR));
    setXpIntoLevel((prevXp) => {
      let next = prevXp + gained;
      setLevel((prevLevel) => {
        let lvl = prevLevel;
        while (next >= XP_PER_LEVEL) {
          next -= XP_PER_LEVEL;
          lvl += 1;
        }
        return lvl;
      });
      return next >= XP_PER_LEVEL ? next % XP_PER_LEVEL : next;
    });
  }, []);

  /** Credits tokens + writes the matching ledger/history entry atomically. */
  const claimReward = useCallback(
    (label: string, rewardTokens: number) => {
      applyAndRecord({ kind: 'reward', label, delta: rewardTokens });
      grantXp(rewardTokens);
    },
    [grantXp]
  );

  // ---- Daily check-in -------------------------------------------------
  const streak = todayClaimed ? claimedDayCount + 1 : claimedDayCount;
  const checkInDays: CheckInDayView[] = CHECK_IN_DAYS.map((d, index) => {
    let state: CheckInDayState;
    if (index === TODAY_INDEX) {
      state = todayClaimed ? 'claimed' : 'today';
    } else if (index < TODAY_INDEX) {
      state = index < claimedDayCount ? 'claimed' : 'locked';
    } else {
      state = 'locked';
    }
    return { ...d, state };
  });

  const claimToday = useCallback(() => {
    if (todayClaimed) return;
    const today = CHECK_IN_DAYS[TODAY_INDEX];
    claimReward(`Daily check-in · ${today.label}`, today.rewardTokens);
    setTodayClaimed(true);
  }, [todayClaimed, claimReward]);

  // ---- Missions ---------------------------------------------------------
  const missions: MissionView[] = missionState.map((m) => {
    const claimed = claimedMissionIds.has(m.id);
    const complete = m.progress >= m.target;
    let claimState: ClaimState;
    if (claimed) claimState = 'claimed';
    else if (m.requiresLevel && level < m.requiresLevel) claimState = 'locked';
    else if (complete) claimState = 'claimable';
    else claimState = 'in-progress';
    return { ...m, claimState };
  });

  const claimMission = useCallback(
    (id: string) => {
      const mission = missionState.find((m) => m.id === id);
      if (!mission || claimedMissionIds.has(id) || mission.progress < mission.target) return;
      claimReward(`Mission: ${mission.title}`, mission.rewardTokens);
      setClaimedMissionIds((prev) => new Set(prev).add(id));
    },
    [missionState, claimedMissionIds, claimReward]
  );

  // ---- Weekly challenges --------------------------------------------------
  const weeklyChallenges: WeeklyChallengeView[] = weeklyState.map((c) => {
    const claimed = claimedWeeklyIds.has(c.id);
    const complete = c.progress >= c.target;
    let claimState: ClaimState;
    if (claimed) claimState = 'claimed';
    else if (c.requiresLevel && level < c.requiresLevel) claimState = 'locked';
    else if (complete) claimState = 'claimable';
    else claimState = 'in-progress';
    return { ...c, claimState };
  });

  const claimWeekly = useCallback(
    (id: string) => {
      const challenge = weeklyState.find((c) => c.id === id);
      if (!challenge || claimedWeeklyIds.has(id) || challenge.progress < challenge.target) return;
      if (challenge.requiresLevel && level < challenge.requiresLevel) return;
      claimReward(`Weekly: ${challenge.title}`, challenge.rewardTokens);
      setClaimedWeeklyIds((prev) => new Set(prev).add(id));
    },
    [weeklyState, claimedWeeklyIds, claimReward, level]
  );

  // ---- Achievements (display-only, no claim) -------------------------
  const achievements: Achievement[] = ACHIEVEMENTS;

  // ---- Milestones -------------------------------------------------------
  const gamesPlayed = MOCK_STATS.gamesPlayed;
  const milestones: MilestoneView[] = MILESTONES.map((m) => {
    const claimed = claimedMilestoneIds.has(m.id);
    const progress = gamesPlayed;
    const reached = progress >= m.target;
    let claimState: ClaimState;
    if (claimed) claimState = 'claimed';
    else if (reached) claimState = 'claimable';
    else claimState = 'locked';
    return { ...m, progress, claimState };
  });

  const claimMilestone = useCallback(
    (id: string) => {
      const milestone = MILESTONES.find((m) => m.id === id);
      if (!milestone || claimedMilestoneIds.has(id) || gamesPlayed < milestone.target) return;
      claimReward(`Milestone: ${milestone.title}`, milestone.rewardTokens);
      setClaimedMilestoneIds((prev) => new Set(prev).add(id));
    },
    [claimedMilestoneIds, claimReward, gamesPlayed]
  );

  // ---- Cosmetics (no token reward — purely local ownership state) -------
  const cosmetics: CosmeticView[] = COSMETICS.map((c) => {
    const owned = ownedCosmeticIds.has(c.id);
    const selected = selectedCosmeticId === c.id;
    let claimState: ClaimState;
    if (owned) claimState = 'claimed';
    else if (c.requiresLevel && level < c.requiresLevel) claimState = 'locked';
    else claimState = 'claimable';
    return { ...c, claimState, owned, selected };
  });

  const claimCosmetic = useCallback(
    (id: string) => {
      const cosmetic = COSMETICS.find((c) => c.id === id);
      if (!cosmetic) return;
      if (cosmetic.requiresLevel && level < cosmetic.requiresLevel) return;
      setOwnedCosmeticIds((prev) => new Set(prev).add(id));
      setSelectedCosmeticId(id);
    },
    [level]
  );

  const selectCosmetic = useCallback(
    (id: string) => {
      if (!ownedCosmeticIds.has(id)) return;
      setSelectedCosmeticId(id);
    },
    [ownedCosmeticIds]
  );

  const levelTitle = LEVEL_TITLES[level] ?? 'Legend';
  const xpProgress = useMemo(() => Math.min(1, xpIntoLevel / XP_PER_LEVEL), [xpIntoLevel]);

  return {
    level,
    levelTitle,
    xpIntoLevel,
    xpForNextLevel: XP_PER_LEVEL,
    xpProgress,

    streak,
    checkInDays,
    todayClaimed,
    claimToday,

    missions,
    claimMission,

    weeklyChallenges,
    claimWeekly,

    achievements,

    milestones,
    claimMilestone,

    cosmetics,
    claimCosmetic,
    selectCosmetic,
  };
}

export type RewardsState = ReturnType<typeof useRewards>;
