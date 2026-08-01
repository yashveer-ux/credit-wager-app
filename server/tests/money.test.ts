import { describe, expect, it } from 'vitest';

import {
  applySpread,
  convertMinor,
  formatAmount,
  formatFixed,
  parseAmount,
  parseRate,
} from '../src/money.ts';

describe('parseAmount', () => {
  it('parses the shapes Postgres actually returns', () => {
    expect(parseAmount('1240.5')).toBe(12_405_000n);
    expect(parseAmount('1240.5000')).toBe(12_405_000n);
    expect(parseAmount('-2000.0000')).toBe(-20_000_000n);
    expect(parseAmount('0')).toBe(0n);
    expect(parseAmount('0.0000')).toBe(0n);
    expect(parseAmount('-0.0000')).toBe(0n);
    expect(parseAmount('0.0001')).toBe(1n);
    expect(parseAmount('-0.0001')).toBe(-1n);
  });

  it('keeps every digit of a full-width numeric(18,4)', () => {
    expect(parseAmount('99999999999999.9999')).toBe(999_999_999_999_999_999n);
    expect(formatAmount(999_999_999_999_999_999n)).toBe('99999999999999.9999');
  });

  it('accepts trailing zeros beyond scale but refuses to silently lose precision', () => {
    expect(parseAmount('1.50000000')).toBe(15_000n);
    expect(() => parseAmount('0.00005')).toThrow(/decimal places/);
    expect(() => parseAmount('1.23456')).toThrow(/decimal places/);
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'abc', '1e5', '1.2.3', ' 1', '1 ', '.5', '-', 'NaN', 'Infinity', '1,5']) {
      expect(() => parseAmount(bad), bad).toThrow(/not a numeric string/);
    }
    // @ts-expect-error deliberately wrong type — Drizzle can hand back null
    expect(() => parseAmount(null)).toThrow(/not a numeric string/);
  });
});

describe('formatAmount', () => {
  it('always emits four decimal places', () => {
    expect(formatAmount(0n)).toBe('0.0000');
    expect(formatAmount(1n)).toBe('0.0001');
    expect(formatAmount(-1n)).toBe('-0.0001');
    expect(formatAmount(12_405_000n)).toBe('1240.5000');
    expect(formatAmount(-20_000_000n)).toBe('-2000.0000');
  });

  it('round trips', () => {
    const values = [
      '0.0000',
      '0.0001',
      '-0.0001',
      '1.0000',
      '1240.5000',
      '-2000.0000',
      '99999999999999.9999',
      '-99999999999999.9999',
    ];
    for (const v of values) expect(formatAmount(parseAmount(v))).toBe(v);

    for (let i = -5000n; i <= 5000n; i += 7n) {
      expect(parseAmount(formatAmount(i))).toBe(i);
    }
  });

  it('refuses values numeric(18,4) cannot hold', () => {
    expect(() => formatAmount(10n ** 18n)).toThrow(/out of range/);
    expect(() => formatAmount(-(10n ** 18n))).toThrow(/out of range/);
  });

  it('does not do what floats do', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the bug this module exists to avoid
    expect(parseAmount('0.1') + parseAmount('0.2')).toBe(parseAmount('0.3'));

    // 8 decimal places of rate survive exactly.
    expect(parseRate('0.01234567')).toBe(1_234_567n);
    expect(formatFixed(parseRate('0.01234567'), 8)).toBe('0.01234567');
  });
});

describe('applySpread', () => {
  it('floors toward the house', () => {
    expect(applySpread(10_000n, 0)).toBe(10_000n);
    expect(applySpread(10_000n, 500)).toBe(9_500n);
    // 1 * 0.95 = 0.95 -> the house keeps the 0.95, the user gets 0.
    expect(applySpread(1n, 500)).toBe(0n);
    expect(applySpread(3n, 1)).toBe(2n); // 2.9997 floored, never rounded up
  });

  it('rejects a nonsense spread', () => {
    for (const bps of [-1, 10_000, 1.5, NaN]) {
      expect(() => applySpread(100n, bps)).toThrow(/spread_bps/);
    }
  });
});

describe('convertMinor', () => {
  // Seed rates: cash is the pivot, GPT credits are 0.012 cash with a 5% spread.
  const CASH = { rate: parseRate('1'), bps: 0 };
  const GPT = { rate: parseRate('0.012'), bps: 500 };
  const EL = { rate: parseRate('0.008'), bps: 750 };

  const go = (amount: bigint, from: typeof CASH, to: typeof CASH) =>
    convertMinor({
      amount,
      fromRate: from.rate,
      fromSpreadBps: from.bps,
      toRate: to.rate,
      toSpreadBps: to.bps,
    });

  it('converts through cash at the stated rate', () => {
    // 100 cash -> 100/0.012 = 8333.3333 credits, minus 5% = 7916.6666
    const { to } = go(parseAmount('100'), CASH, GPT);
    expect(formatAmount(to)).toBe('7916.6666');
  });

  it('the house wins the round trip', () => {
    const start = parseAmount('100');
    const out = go(start, CASH, GPT).to;
    const back = go(out, GPT, CASH).to;

    expect(back).toBeLessThan(start);
    // One spread each way: 0.95 * 0.95 = 0.9025, so 90.25 at best. The extra
    // 0.0001 gone is the flooring dust, and it goes to the house, not the user.
    expect(formatAmount(back)).toBe('90.2499');
  });

  it('the house wins every round trip, for every pair and size', () => {
    const pairs = [
      [CASH, GPT],
      [GPT, CASH],
      [CASH, EL],
      [GPT, EL],
      [EL, GPT],
    ] as const;

    for (const [a, b] of pairs) {
      for (const raw of ['0.0001', '0.0007', '1', '1.3333', '7.77', '100', '999999.9999']) {
        const start = parseAmount(raw);
        const out = go(start, a, b).to;
        const back = out > 0n ? go(out, b, a).to : 0n;
        expect(back, `${raw} ${a.rate}->${b.rate}`).toBeLessThan(start);
      }
    }
  });

  it('cannot be farmed by repeating tiny conversions', () => {
    // Grind the same balance back and forth 200 times. Monotonically down, never up.
    let held = parseAmount('50');
    let previousCash = held;
    for (let i = 0; i < 100; i++) {
      const toGpt = go(held, CASH, GPT);
      if (toGpt.to <= 0n) break;
      const back = go(toGpt.to, GPT, CASH);
      expect(back.to).toBeLessThan(previousCash);
      previousCash = back.to;
      held = back.to;
    }
    expect(held).toBeLessThan(parseAmount('50'));

    // The smallest possible unit rounds to dust rather than minting any.
    const dust = go(1n, CASH, GPT);
    expect(go(dust.to || 1n, GPT, CASH).to).toBe(0n);
  });

  it('never gains even with zero spread on both sides', () => {
    const A = { rate: parseRate('0.33333333'), bps: 0 };
    const B = { rate: parseRate('0.07'), bps: 0 };
    for (const raw of ['0.0001', '0.5', '3.3333', '12345.6789']) {
      const start = parseAmount(raw);
      const out = go(start, A, B).to;
      const back = out > 0n ? go(out, B, A).to : 0n;
      expect(back, raw).toBeLessThanOrEqual(start);
    }
  });

  it('rejects nonsense inputs', () => {
    expect(() => go(0n, CASH, GPT)).toThrow(/must be positive/);
    expect(() => go(-1n, CASH, GPT)).toThrow(/must be positive/);
    expect(() => go(1n, CASH, { rate: 0n, bps: 0 })).toThrow(/rates must be positive/);
  });
});
