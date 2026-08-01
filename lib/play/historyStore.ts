/**
 * Persistent, capped ledger of recent Play rounds. Same external-store
 * pattern as `balanceStore.ts`. Purely additive — does not touch the
 * unrelated Home/History tab ledger in `lib/mock.ts`.
 */

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameId, PlayHistoryEntry } from './types';

const STORAGE_KEY = 'play:history:v1';
const MAX_ENTRIES = 30;

let entries: PlayHistoryEntry[] = [];
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
    // Best-effort; history is a nice-to-have, not load-bearing.
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
      // Fall back to an empty history.
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

function getSnapshot(): PlayHistoryEntry[] {
  return entries;
}

export function recordRound(input: {
  gameId: GameId;
  label: string;
  wager: number;
  delta: number;
  balanceAfter: number;
}): void {
  const entry: PlayHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  notify();
  void persist();
}

export function clearHistory(): void {
  entries = [];
  notify();
  void persist();
}

export function usePlayHistory(): PlayHistoryEntry[] {
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}
