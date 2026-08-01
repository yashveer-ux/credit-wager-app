/**
 * Unified transaction ledger for every non-game balance change (reward
 * claims, promo-code redemptions, demo withdrawals), plus a merged view
 * that folds in the per-round game history from `lib/play/historyStore`.
 *
 * Game rounds keep writing through `recordRound` as before — they are
 * mapped into this shape at read time, never double-recorded here.
 *
 * `applyAndRecord` is the only sanctioned way to change the balance
 * outside a game round: it debits/credits exactly once and writes the
 * matching ledger entry atomically, so a balance change can never exist
 * without its history entry.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { applyBalanceDelta } from '../play/balanceStore';
import { getGame } from '../play/games';
import { usePlayHistory } from '../play/historyStore';

const STORAGE_KEY = 'ledger:v1';
const MAX_ENTRIES = 100;

export type LedgerKind = 'game' | 'reward' | 'promo' | 'withdrawal';
export type LedgerStatus = 'completed' | 'demo';

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  /** Human-readable description, e.g. "Daily check-in" or "Promo code OPENAI-500". */
  label: string;
  /** Game name or AI provider name, when relevant. */
  provider?: string;
  /** Signed token amount: negative = debit, positive = credit. */
  delta: number;
  balanceAfter: number;
  status?: LedgerStatus;
  createdAt: string;
};

let entries: LedgerEntry[] = [];
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort; in-memory ledger still works for the session.
  }
}

function hydrate(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) entries = parsed;
      }
    } catch {
      // Fall back to an empty ledger.
    } finally {
      hydrated = true;
      notify();
    }
  })();
  return hydrationPromise;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LedgerEntry[] {
  return entries;
}

/**
 * Applies a signed balance delta and records the matching ledger entry in
 * one step. Returns the new balance. Game rounds must NOT use this — they
 * already flow in via `recordRound`.
 */
export function applyAndRecord(input: {
  kind: Exclude<LedgerKind, 'game'>;
  label: string;
  provider?: string;
  delta: number;
  status?: LedgerStatus;
}): number {
  const balanceAfter = applyBalanceDelta(input.delta);
  const entry: LedgerEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    balanceAfter,
    ...input,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  notify();
  void persist();
  return balanceAfter;
}

/** Non-game ledger entries (rewards, promo redemptions, withdrawals), newest first. */
export function useLedger(): LedgerEntry[] {
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}

/** Every balance-affecting event — game rounds plus ledger entries — newest first. */
export function useUnifiedHistory(): LedgerEntry[] {
  const ledger = useLedger();
  const plays = usePlayHistory();
  return useMemo(() => {
    const games: LedgerEntry[] = plays.map((p) => ({
      id: `game-${p.id}`,
      kind: 'game' as const,
      label: p.label,
      provider: getGame(p.gameId)?.name,
      delta: p.delta,
      balanceAfter: p.balanceAfter,
      createdAt: p.createdAt,
    }));
    return [...ledger, ...games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [ledger, plays]);
}
