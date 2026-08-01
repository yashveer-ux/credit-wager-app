/**
 * Pre-seeded mock payout methods for the demo Withdraw flow.
 *
 * These are display-only fixtures: the app never collects real payment
 * credentials, so the "detail" strings are hardcoded masked placeholders.
 * Fees are expressed as a fractional rate of the withdrawal amount.
 */

import type Ionicons from '@expo/vector-icons/Ionicons';

export type PayoutMethod = {
  id: string;
  label: string;
  /** Masked account hint, e.g. "•••• 4242". Never real user data. */
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Fractional fee rate applied to the amount (0 = free). */
  fee: number;
  feeLabel: string;
  eta: string;
};

export const PAYOUT_METHODS: PayoutMethod[] = [
  {
    id: 'visa',
    label: 'Visa Debit',
    detail: '•••• 4242',
    icon: 'card',
    fee: 0,
    feeLabel: 'No fee',
    eta: 'Instant',
  },
  {
    id: 'bank',
    label: 'Bank Transfer',
    detail: 'Checking ••6789',
    icon: 'business',
    fee: 0,
    feeLabel: 'No fee',
    eta: '1–3 business days',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    detail: 'y•••@gmail.com',
    icon: 'logo-paypal',
    fee: 0.01,
    feeLabel: '1% fee',
    eta: 'Within 24 hours',
  },
];

/** Smallest whole-token amount the demo flow will accept. */
export const MIN_WITHDRAWAL = 100;

/** Fee in tokens for withdrawing `amount` via `method`, rounded to cents. */
export function feeFor(amount: number, method: PayoutMethod): number {
  return Math.round(amount * method.fee * 100) / 100;
}
