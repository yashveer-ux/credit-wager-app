import { formatAmount, formatRelativeTime, formatSigned } from './format';

describe('formatAmount', () => {
  it('formats cash as USD currency', () => {
    expect(formatAmount(1240.5, 'SIM_CASH')).toBe('$1,240.50');
  });

  it('formats credits with a ticker and no decimals', () => {
    expect(formatAmount(15000, 'SIM_CHATGPT')).toBe('15,000 GPT');
    expect(formatAmount(4200, 'SIM_ANTHROPIC')).toBe('4,200 CLD');
    expect(formatAmount(6250, 'SIM_ELEVENLABS')).toBe('6,250 XIL');
  });

  it('drops the sign — the caller decides how to show direction', () => {
    expect(formatAmount(-2000, 'SIM_ANTHROPIC')).toBe('2,000 CLD');
  });
});

describe('formatSigned', () => {
  it('marks debits and credits explicitly', () => {
    expect(formatSigned(4200, 'SIM_ANTHROPIC')).toBe('+4,200 CLD');
    expect(formatSigned(-2000, 'SIM_ANTHROPIC')).toBe('−2,000 CLD');
    expect(formatSigned(-50, 'SIM_CASH')).toBe('−$50.00');
  });

  it('treats zero as a credit rather than a debit', () => {
    expect(formatSigned(0, 'SIM_CASH')).toBe('+$0.00');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-01T12:00:00Z');

  it('falls back to "just now" under a minute', () => {
    expect(formatRelativeTime('2026-08-01T11:59:30Z', now)).toBe('just now');
  });

  it('picks the largest fitting unit', () => {
    expect(formatRelativeTime('2026-08-01T11:20:00Z', now)).toBe('40 minutes ago');
    expect(formatRelativeTime('2026-08-01T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-07-31T12:00:00Z', now)).toBe('yesterday');
  });
});
