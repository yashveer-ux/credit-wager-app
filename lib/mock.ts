/**
 * Mock data layer for the prototype home screen.
 *
 * Shapes mirror the `credit_types` / `wallets` / `transactions` tables in the
 * architecture spec, so swapping `fetchHome` for a real API call is the only
 * change needed once the backend exists.
 *
 * Everything here is simulated. No real money, no real AI-provider credits.
 */

export type CreditTypeCode =
  | 'SIM_CASH'
  | 'SIM_CHATGPT'
  | 'SIM_ANTHROPIC'
  | 'SIM_ELEVENLABS';

export type CreditType = {
  code: CreditTypeCode;
  displayName: string;
  /** Short label shown next to amounts, e.g. "1,200 GPT". Unused for cash. */
  ticker: string;
  /** Simulated rate to cash, per the spec's `sim_exchange_rate_to_cash`. */
  simExchangeRateToCash: number;
};

export type TransactionType =
  | 'CONVERSION_IN'
  | 'CONVERSION_OUT'
  | 'WAGER'
  | 'PAYOUT'
  | 'ADJUSTMENT';

export type Transaction = {
  id: string;
  type: TransactionType;
  creditTypeCode: CreditTypeCode;
  /** Signed: negative = debit, positive = credit. */
  amount: number;
  createdAt: string;
};

export type HomeData = {
  displayName: string;
  cashBalance: number;
  recentTransactions: Transaction[];
};

export const CREDIT_TYPES: Record<CreditTypeCode, CreditType> = {
  SIM_CASH: {
    code: 'SIM_CASH',
    displayName: 'Cash',
    ticker: 'USD',
    simExchangeRateToCash: 1,
  },
  SIM_CHATGPT: {
    code: 'SIM_CHATGPT',
    displayName: 'GPT Credits',
    ticker: 'GPT',
    simExchangeRateToCash: 0.012,
  },
  SIM_ANTHROPIC: {
    code: 'SIM_ANTHROPIC',
    displayName: 'Claude Credits',
    ticker: 'CLD',
    simExchangeRateToCash: 0.015,
  },
  SIM_ELEVENLABS: {
    code: 'SIM_ELEVENLABS',
    displayName: 'ElevenLabs Credits',
    ticker: 'XIL',
    simExchangeRateToCash: 0.008,
  },
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  CONVERSION_IN: 'Converted in',
  CONVERSION_OUT: 'Converted out',
  WAGER: 'Wager',
  PAYOUT: 'Payout',
  ADJUSTMENT: 'Adjustment',
};

const HOME: HomeData = {
  displayName: 'Yash',
  cashBalance: 1240.5,
  recentTransactions: [
    {
      id: 't1',
      type: 'PAYOUT',
      creditTypeCode: 'SIM_ANTHROPIC',
      amount: 4200,
      createdAt: '2026-08-01T09:41:00Z',
    },
    {
      id: 't2',
      type: 'WAGER',
      creditTypeCode: 'SIM_ANTHROPIC',
      amount: -2000,
      createdAt: '2026-08-01T09:40:00Z',
    },
    {
      id: 't3',
      type: 'CONVERSION_IN',
      creditTypeCode: 'SIM_CHATGPT',
      amount: 15000,
      createdAt: '2026-07-31T20:12:00Z',
    },
    {
      id: 't4',
      type: 'CONVERSION_OUT',
      creditTypeCode: 'SIM_ELEVENLABS',
      amount: -6250,
      createdAt: '2026-07-31T18:03:00Z',
    },
    {
      id: 't5',
      type: 'WAGER',
      creditTypeCode: 'SIM_CHATGPT',
      amount: -500,
      createdAt: '2026-07-30T22:55:00Z',
    },
  ],
};

/**
 * Stand-in for `GET /wallets` + `GET /transactions`. Delayed so the loading
 * state is reachable; pass `{ empty: true }` to exercise the empty state.
 */
export function fetchHome(opts: { empty?: boolean } = {}): Promise<HomeData> {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          opts.empty ? { ...HOME, cashBalance: 0, recentTransactions: [] } : HOME
        ),
      700
    )
  );
}
