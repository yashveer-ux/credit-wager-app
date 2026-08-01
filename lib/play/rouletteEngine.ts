/**
 * European (single-zero) roulette rules: wheel order, number properties,
 * and bet resolution. Pure functions only.
 */

import type { RouletteBetType } from './payouts';

/** Standard European wheel pocket order, used for the spin animation. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = 'red' | 'black' | 'green';

export function colorOf(n: number): PocketColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function isOdd(n: number): boolean {
  return n !== 0 && n % 2 === 1;
}

export function isEven(n: number): boolean {
  return n !== 0 && n % 2 === 0;
}

export function isLow(n: number): boolean {
  return n >= 1 && n <= 18;
}

export function isHigh(n: number): boolean {
  return n >= 19 && n <= 36;
}

/** 1, 2, or 3 for the number's dozen; null for 0 (no dozen). */
export function dozenOf(n: number): 1 | 2 | 3 | null {
  if (n <= 0 || n > 36) return null;
  if (n <= 12) return 1;
  if (n <= 24) return 2;
  return 3;
}

export function spin(): number {
  return Math.floor(Math.random() * 37);
}

export type RouletteBet = { type: RouletteBetType; value?: number };

/** Whether a bet wins against a given result number. */
export function resolveBet(bet: RouletteBet, result: number): boolean {
  switch (bet.type) {
    case 'straight':
      return bet.value === result;
    case 'red':
      return colorOf(result) === 'red';
    case 'black':
      return colorOf(result) === 'black';
    case 'odd':
      return isOdd(result);
    case 'even':
      return isEven(result);
    case 'low':
      return isLow(result);
    case 'high':
      return isHigh(result);
    case 'dozen1':
      return dozenOf(result) === 1;
    case 'dozen2':
      return dozenOf(result) === 2;
    case 'dozen3':
      return dozenOf(result) === 3;
  }
}
