/**
 * Money as BigInt in minor units at 10^4, matching numeric(18,4). Never a
 * JS number: 0.1 + 0.2 is a bug people get paged for.
 *
 * Rates live at 10^8, matching numeric(18,8). A rate is not money, so it never
 * mixes with an amount without going through convertMinor().
 */

const AMOUNT_SCALE = 4;
const RATE_SCALE = 8;

/** 1.0 as a rate. */
const RATE_ONE = 10n ** BigInt(RATE_SCALE);

/** numeric(18,4) holds 18 significant digits total. */
const AMOUNT_MAX = 10n ** 18n;

const NUMERIC = /^([+-]?)(\d+)(?:\.(\d*))?$/;

/** Exact string -> bigint at `scale` decimal places. Rejects anything else. */
export function parseFixed(value: string, scale: number): bigint {
  const m = typeof value === 'string' ? NUMERIC.exec(value) : null;
  if (!m) throw new Error(`not a numeric string: ${JSON.stringify(value)}`);

  const [, sign, whole, frac = ''] = m;
  // Postgres pads to the column scale, so extra digits are only ever zeros.
  // Anything else is real precision we would silently destroy.
  if (/[^0]/.test(frac.slice(scale))) {
    throw new Error(`more than ${scale} decimal places would be lost: ${value}`);
  }
  return BigInt((sign === '-' ? '-' : '') + whole + frac.padEnd(scale, '0').slice(0, scale));
}

/** bigint at `scale` -> a numeric-safe string. Always emits all `scale` digits. */
export function formatFixed(minor: bigint, scale: number): string {
  const neg = minor < 0n;
  const digits = (neg ? -minor : minor).toString().padStart(scale + 1, '0');
  return `${neg ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export const parseAmount = (dbValue: string): bigint => parseFixed(dbValue, AMOUNT_SCALE);
export const parseRate = (dbValue: string): bigint => parseFixed(dbValue, RATE_SCALE);

export function formatAmount(minor: bigint): string {
  if (minor >= AMOUNT_MAX || minor <= -AMOUNT_MAX) {
    throw new Error(`amount out of range for numeric(18,4): ${minor}`);
  }
  return formatFixed(minor, AMOUNT_SCALE);
}

/**
 * Shave `bps` basis points off a non-negative value, flooring. The floor is the
 * point: the fraction of a minor unit goes to the house, never to the user.
 */
export function applySpread(value: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10_000) {
    throw new Error(`spread_bps out of range: ${bps}`);
  }
  return (value * BigInt(10_000 - bps)) / 10_000n;
}

/**
 * from-units -> cash -> to-units.
 *
 * Every division floors and every operand is non-negative, so each step rounds
 * DOWN, i.e. toward the house. The cash value of the output is therefore always
 * <= the cash value of the input, with or without spread — which is what stops a
 * long sequence of tiny conversions from minting value. `amount` must be > 0.
 */
export function convertMinor(args: {
  amount: bigint;
  fromRate: bigint;
  fromSpreadBps: number;
  toRate: bigint;
  toSpreadBps: number;
}): { cash: bigint; to: bigint } {
  const { amount, fromRate, toRate } = args;
  if (amount <= 0n) throw new Error(`amount must be positive: ${amount}`);
  if (fromRate <= 0n || toRate <= 0n) throw new Error('exchange rates must be positive');

  const cash = applySpread((amount * fromRate) / RATE_ONE, args.fromSpreadBps);
  return { cash, to: applySpread((cash * RATE_ONE) / toRate, args.toSpreadBps) };
}
