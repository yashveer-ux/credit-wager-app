import { describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

// Loaded with require, not import: it must resolve after jest.mock above.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyEvent } = require('./blackjack') as typeof import('./blackjack');

import type { TableState } from './blackjack';

const state: TableState = {
  id: 't1',
  status: 'playing',
  version: 4,
  seats: [],
  dealer: { cards: [] },
};

const event = (version: number, payload: unknown) => ({
  type: 'state',
  tableId: 't1',
  version,
  payload,
});

describe('applyEvent', () => {
  it('merges the next sequential event and bumps the version', () => {
    const next = applyEvent(state, event(5, { status: 'settled', activeSeat: null }));
    expect(next).toMatchObject({ id: 't1', version: 5, status: 'settled', activeSeat: null });
  });

  it('returns the state unchanged for a stale event', () => {
    expect(applyEvent(state, event(4, { status: 'settled' }))).toBe(state);
    expect(applyEvent(state, event(1, { status: 'settled' }))).toBe(state);
  });

  it('requests a resync on a version gap', () => {
    expect(applyEvent(state, event(6, { status: 'settled' }))).toBeNull();
  });

  it('requests a resync when there is nothing to merge', () => {
    expect(applyEvent(state, event(5, undefined))).toBeNull();
    expect(applyEvent(state, event(5, 'not-an-object'))).toBeNull();
  });

  it('requests a resync when no snapshot has loaded yet', () => {
    expect(applyEvent(null, event(1, { status: 'betting' }))).toBeNull();
  });

  it('never lets a patch change the table id', () => {
    const next = applyEvent(state, event(5, { id: 'attacker-table' }));
    expect(next?.id).toBe('t1');
  });
});
