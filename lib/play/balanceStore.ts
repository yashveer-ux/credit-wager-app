/**
 * Persistent AI Token balance for the Play feature.
 *
 * A tiny external store (subscribe/getSnapshot, driven through
 * `useSyncExternalStore`) rather than a React Context — this way no provider
 * needs to be threaded into the app's root layout, keeping every screen
 * outside `app/play/**` and `app/(tabs)/play.tsx` completely untouched.
 *
 * AI Tokens are a fictional demo currency only. They are not tied to real
 * money, and are intentionally separate from the SIM_* credit types in
 * `lib/mock.ts`, which belong to the (unbuilt) Convert feature.
 */

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'play:balance:v1';
export const STARTING_BALANCE = 5000;

let balance = STARTING_BALANCE;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(balance));
  } catch {
    // Best-effort persistence; an in-memory balance still works for the session.
  }
}

function hydrate(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(JSON.parse(raw));
        if (Number.isFinite(parsed) && parsed >= 0) balance = parsed;
      }
    } catch {
      // Fall back to the in-memory default.
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

function getSnapshot(): number {
  return balance;
}

function getHydrated(): boolean {
  return hydrated;
}

export function canAfford(amount: number): boolean {
  return amount > 0 && amount <= balance;
}

/** Applies a signed delta to the balance (negative = debit, positive = credit). */
export function applyBalanceDelta(delta: number): number {
  balance = Math.max(0, roundMoney(balance + delta));
  notify();
  void persist();
  return balance;
}

export function resetBalance(): void {
  balance = STARTING_BALANCE;
  notify();
  void persist();
}

export const TOP_UP_AMOUNT = 5000;

/**
 * Grants demo tokens. A delta rather than an absolute reset, because the server
 * mirror only knows how to grant — there is no un-grant, so setting the balance
 * to a fixed number would drift the two apart whenever it went down.
 */
export function topUpBalance(): number {
  applyBalanceDelta(TOP_UP_AMOUNT);
  return TOP_UP_AMOUNT;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Live balance; triggers hydration from disk on first mount. */
export function useBalance(): { balance: number; hydrated: boolean } {
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, []);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => STARTING_BALANCE);
  const isHydrated = useSyncExternalStore(subscribe, getHydrated, () => false);
  return { balance: value, hydrated: isHydrated };
}
