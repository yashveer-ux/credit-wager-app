import { CREDIT_TYPES, type CreditTypeCode } from './mock';

const cashFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const creditFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/** Absolute value formatted for its credit type. Cash gets a currency symbol. */
export function formatAmount(amount: number, code: CreditTypeCode): string {
  const value = Math.abs(amount);
  return code === 'SIM_CASH'
    ? cashFormatter.format(value)
    : `${creditFormatter.format(value)} ${CREDIT_TYPES[code].ticker}`;
}

/** Ledger amount with an explicit sign, e.g. "−2,000 CLD" or "+$50.00". */
export function formatSigned(amount: number, code: CreditTypeCode): string {
  // U+2212 minus, not a hyphen — lines up with digits at large sizes.
  const sign = amount < 0 ? '−' : '+';
  return `${sign}${formatAmount(amount, code)}`;
}

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 hours ago", "yesterday". Falls back to "just now" under a minute. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}
