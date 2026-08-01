import { describe, expect, it } from '@jest/globals';

import {
  blackjackPayout,
  chambersMultiplier,
  chambersPayout,
  crashMultiplierFromRandom,
  CRASH_MAX_MULTIPLIER,
  roulettePayout,
  rouletteMultiplier,
  turingBetMultiplier,
  turingBetPayout,
  TURING_BET_MULTIPLIERS,
} from './payouts';

describe('blackjackPayout', () => {
  it('pays 2.5x total return on a natural blackjack', () => {
    expect(blackjackPayout(100, 'blackjack')).toBe(250);
  });

  it('pays 2x total return on a normal win', () => {
    expect(blackjackPayout(100, 'win')).toBe(200);
  });

  it('returns exactly the wager on a push', () => {
    expect(blackjackPayout(100, 'push')).toBe(100);
  });

  it('returns 0 on a loss', () => {
    expect(blackjackPayout(100, 'loss')).toBe(0);
  });
});

describe('rouletteMultiplier / roulettePayout', () => {
  it('pays 36x total return for a straight number win', () => {
    expect(rouletteMultiplier('straight')).toBe(36);
    expect(roulettePayout(10, 'straight', true)).toBe(360);
  });

  it('pays 2x total return for even-money bets', () => {
    for (const type of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) {
      expect(rouletteMultiplier(type)).toBe(2);
      expect(roulettePayout(10, type, true)).toBe(20);
    }
  });

  it('pays 3x total return for dozen bets', () => {
    for (const type of ['dozen1', 'dozen2', 'dozen3'] as const) {
      expect(rouletteMultiplier(type)).toBe(3);
      expect(roulettePayout(10, type, true)).toBe(30);
    }
  });

  it('pays nothing on a loss', () => {
    expect(roulettePayout(10, 'straight', false)).toBe(0);
  });
});

describe('crashMultiplierFromRandom', () => {
  it('matches the exact house-edge formula from the spec', () => {
    const r = 0.5;
    const expected = Math.max(1, Math.floor((0.96 / (1 - r)) * 100) / 100);
    expect(crashMultiplierFromRandom(r)).toBe(expected);
  });

  it('never returns less than 1', () => {
    expect(crashMultiplierFromRandom(0)).toBe(1);
  });

  it('caps extreme draws at the configured maximum', () => {
    expect(crashMultiplierFromRandom(0.9999)).toBe(CRASH_MAX_MULTIPLIER);
    expect(crashMultiplierFromRandom(0.999999999)).toBeLessThanOrEqual(CRASH_MAX_MULTIPLIER);
  });
});

describe('chambersMultiplier', () => {
  it('matches the suggested displayed multipliers', () => {
    expect(chambersMultiplier(1)).toBe(1.15);
    expect(chambersMultiplier(2)).toBe(1.44);
    expect(chambersMultiplier(3)).toBe(1.92);
    expect(chambersMultiplier(4)).toBe(2.88);
    expect(chambersMultiplier(5)).toBe(5.76);
  });

  it('treats 0 safe chambers as a 1x (no-op) multiplier', () => {
    expect(chambersMultiplier(0)).toBe(1);
  });

  it('computes payout as wager times the multiplier', () => {
    expect(chambersPayout(100, 3)).toBe(192);
  });
});

describe('turingBetMultiplier / turingBetPayout', () => {
  it('matches the suggested multiplier ladder', () => {
    TURING_BET_MULTIPLIERS.forEach((m, i) => {
      expect(turingBetMultiplier(i + 1)).toBe(m);
    });
  });

  it('returns null before any correct answer', () => {
    expect(turingBetMultiplier(0)).toBeNull();
  });

  it('returns null past the maximum round', () => {
    expect(turingBetMultiplier(TURING_BET_MULTIPLIERS.length + 1)).toBeNull();
  });

  it('computes payout as wager times the current multiplier', () => {
    expect(turingBetPayout(100, 1)).toBe(115);
    expect(turingBetPayout(100, 10)).toBe(1000);
  });

  it('pays nothing past the maximum round', () => {
    expect(turingBetPayout(100, 11)).toBe(0);
  });
});
