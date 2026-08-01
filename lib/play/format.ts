/**
 * Formatting helpers for the fictional AI Token currency used across Play.
 * Kept separate from `lib/format.ts`, which formats the unrelated SIM_*
 * credit types used by the (unbuilt) Convert feature.
 */

const tokenFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const TOKEN_LABEL = 'AI Tokens';
export const TOKEN_SHORT_LABEL = 'tokens';

export function formatTokens(amount: number): string {
  return tokenFormatter.format(amount);
}

export function formatSignedTokens(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return `${sign}${tokenFormatter.format(Math.abs(amount))}`;
}

export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}×`;
}
