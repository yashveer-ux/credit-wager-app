import { describe, expect, it } from '@jest/globals';

import {
  colorOf,
  dozenOf,
  isEven,
  isHigh,
  isLow,
  isOdd,
  resolveBet,
  spin,
  WHEEL_ORDER,
  type RouletteBet,
} from './rouletteEngine';
import type { RouletteBetType } from './payouts';

describe('colorOf', () => {
  it('flags 0 as green', () => {
    expect(colorOf(0)).toBe('green');
  });

  it('recognizes known red numbers', () => {
    expect(colorOf(1)).toBe('red');
    expect(colorOf(19)).toBe('red');
    expect(colorOf(36)).toBe('red');
  });

  it('recognizes known black numbers', () => {
    expect(colorOf(2)).toBe('black');
    expect(colorOf(17)).toBe('black');
    expect(colorOf(35)).toBe('black');
  });
});

describe('isOdd / isEven', () => {
  it('treats 0 as neither odd nor even', () => {
    expect(isOdd(0)).toBe(false);
    expect(isEven(0)).toBe(false);
  });

  it('flags 1 as odd and 36 as even', () => {
    expect(isOdd(1)).toBe(true);
    expect(isEven(1)).toBe(false);
    expect(isOdd(36)).toBe(false);
    expect(isEven(36)).toBe(true);
  });
});

describe('isLow / isHigh', () => {
  it('excludes 0 from both ranges', () => {
    expect(isLow(0)).toBe(false);
    expect(isHigh(0)).toBe(false);
  });

  it('includes the boundary values 18 and 19', () => {
    expect(isLow(18)).toBe(true);
    expect(isHigh(18)).toBe(false);
    expect(isLow(19)).toBe(false);
    expect(isHigh(19)).toBe(true);
  });

  it('includes the outer boundary value 36', () => {
    expect(isHigh(36)).toBe(true);
    expect(isLow(36)).toBe(false);
  });
});

describe('dozenOf', () => {
  it('returns null for 0', () => {
    expect(dozenOf(0)).toBeNull();
  });

  it('returns null past 36', () => {
    expect(dozenOf(37)).toBeNull();
  });

  it('maps boundary values to the correct dozen', () => {
    expect(dozenOf(1)).toBe(1);
    expect(dozenOf(12)).toBe(1);
    expect(dozenOf(13)).toBe(2);
    expect(dozenOf(24)).toBe(2);
    expect(dozenOf(25)).toBe(3);
    expect(dozenOf(36)).toBe(3);
  });
});

describe('resolveBet', () => {
  const cases: {
    type: RouletteBetType;
    value?: number;
    winningResult: number;
    losingResult: number;
  }[] = [
    { type: 'straight', value: 17, winningResult: 17, losingResult: 18 },
    { type: 'red', winningResult: 1, losingResult: 2 },
    { type: 'black', winningResult: 2, losingResult: 1 },
    { type: 'odd', winningResult: 1, losingResult: 2 },
    { type: 'even', winningResult: 2, losingResult: 1 },
    { type: 'low', winningResult: 1, losingResult: 19 },
    { type: 'high', winningResult: 19, losingResult: 1 },
    { type: 'dozen1', winningResult: 5, losingResult: 25 },
    { type: 'dozen2', winningResult: 15, losingResult: 5 },
    { type: 'dozen3', winningResult: 30, losingResult: 5 },
  ];

  it.each(cases)('resolves $type correctly for winning and losing results', (c) => {
    const bet: RouletteBet = { type: c.type, value: c.value };
    expect(resolveBet(bet, c.winningResult)).toBe(true);
    expect(resolveBet(bet, c.losingResult)).toBe(false);
  });

  it('a straight bet only wins on an exact number match, including 0', () => {
    expect(resolveBet({ type: 'straight', value: 0 }, 0)).toBe(true);
    expect(resolveBet({ type: 'straight', value: 0 }, 1)).toBe(false);
  });

  it('0 loses every outside bet', () => {
    const outsideTypes: RouletteBetType[] = [
      'red',
      'black',
      'odd',
      'even',
      'low',
      'high',
      'dozen1',
      'dozen2',
      'dozen3',
    ];
    for (const type of outsideTypes) {
      expect(resolveBet({ type }, 0)).toBe(false);
    }
  });
});

describe('spin', () => {
  it('always returns an integer in [0, 36]', () => {
    for (let i = 0; i < 500; i++) {
      const result = spin();
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(36);
    }
  });
});

describe('WHEEL_ORDER', () => {
  it('contains all 37 pockets exactly once', () => {
    expect(WHEEL_ORDER).toHaveLength(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
  });
});
