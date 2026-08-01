/**
 * AsyncStorage-persisted set of promo codes this device has already redeemed.
 * Same tiny external-store pattern as `lib/play/historyStore.ts`.
 *
 * This store only remembers *which* codes were used — the balance credit and
 * the visible history entry both live in `lib/ledger/ledgerStore.ts` via
 * `applyAndRecord`. Keeping the "used" flag separate means re-validating a
 * code can never re-credit tokens.
 *
 * Codes are normalized (trimmed, uppercased) here defensively, so callers may
 * pass raw input. This module stays dependency-free of `codes.ts` to avoid an
 * import cycle (codes.ts imports `isRedeemed` from here).
 */

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'convert:redeemed:v1';

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

let redeemed: ReadonlySet<string> = new Set();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...redeemed]));
  } catch {
    // Best-effort; the in-memory set still protects this session.
  }
}

/**
 * Loads the redeemed set from disk. Safe to call repeatedly — resolves
 * immediately once the first hydration has completed. The redeem flow awaits
 * this before validating so a persisted redemption is never missed.
 */
export function hydrateRedemptions(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          redeemed = new Set(parsed.filter((c): c is string => typeof c === 'string'));
        }
      }
    } catch {
      // Fall back to an empty set.
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

function getSnapshot(): ReadonlySet<string> {
  return redeemed;
}

/** Whether this (normalized) code has already been redeemed on this device. */
export function isRedeemed(code: string): boolean {
  return redeemed.has(normalize(code));
}

/** Records a successful redemption. Idempotent per code. */
export function markRedeemed(code: string): void {
  const normalized = normalize(code);
  if (redeemed.has(normalized)) return;
  const next = new Set(redeemed);
  next.add(normalized);
  redeemed = next;
  notify();
  void persist();
}

/** Live redeemed-code set; triggers hydration from disk on first mount. */
export function useRedeemedCodes(): ReadonlySet<string> {
  useEffect(() => {
    if (!hydrated) void hydrateRedemptions();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => redeemed);
}
