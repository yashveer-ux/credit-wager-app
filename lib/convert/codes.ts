/**
 * Local demo promo-code configuration and validation for the Convert feature.
 *
 * Everything here is fictional: the providers are real-company lookalikes for
 * demo flavor only, and the codes grant the same virtual AI Tokens used by
 * Play. `validateCode` is the single entry point — a future backend replaces
 * this module by swapping its body for an API call that resolves to the same
 * `ValidationResult` union, leaving every caller untouched.
 */

import { isRedeemed } from './redemptionStore';

export type Provider = {
  id: string;
  name: string;
  /** Monogram initials rendered on the brand-colored chip. */
  short: string;
  color: string;
};

export const PROVIDERS: Provider[] = [
  { id: 'openai', name: 'OpenAI', short: 'AI', color: '#10A37F' },
  { id: 'anthropic', name: 'Anthropic', short: 'A', color: '#D97757' },
  { id: 'gemini', name: 'Google Gemini', short: 'G', color: '#4285F4' },
  { id: 'mistral', name: 'Mistral', short: 'M', color: '#FF7000' },
  { id: 'huggingface', name: 'Hugging Face', short: 'HF', color: '#FF9D00' },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getProviderByName(name: string | undefined): Provider | undefined {
  return name ? PROVIDERS.find((p) => p.name === name) : undefined;
}

type DemoCode = {
  code: string;
  providerId: string;
  tokens: number;
  /** ISO timestamp; the code stops working once this moment has passed. */
  expiredAt?: string;
};

const DEMO_CODES: DemoCode[] = [
  { code: 'OPENAI-500', providerId: 'openai', tokens: 500 },
  { code: 'CLAUDE-750', providerId: 'anthropic', tokens: 750 },
  { code: 'GEMINI-300', providerId: 'gemini', tokens: 300 },
  { code: 'MISTRAL-250', providerId: 'mistral', tokens: 250 },
  { code: 'HF-1000', providerId: 'huggingface', tokens: 1000 },
  // Intentionally expired so the demo can show the 'expired' state.
  { code: 'OPENAI-LAUNCH', providerId: 'openai', tokens: 400, expiredAt: '2025-12-31T23:59:59Z' },
];

/** Codes are case-insensitive with surrounding whitespace ignored. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export type ValidationResult =
  | { status: 'valid'; tokens: number; provider: Provider }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'wrong-provider'; expectedProvider: Provider }
  | { status: 'already-used' };

/**
 * Validates a raw code against the selected provider. Pure lookup — it never
 * credits tokens or marks anything redeemed; the caller does that on 'valid'.
 */
export function validateCode(providerId: string, rawCode: string): ValidationResult {
  const code = normalizeCode(rawCode);
  if (!code) return { status: 'invalid' };

  const match = DEMO_CODES.find((c) => c.code === code);
  if (!match) return { status: 'invalid' };

  if (match.providerId !== providerId) {
    const expectedProvider = getProvider(match.providerId);
    // A code pointing at an unknown provider is a config bug; treat as invalid.
    if (!expectedProvider) return { status: 'invalid' };
    return { status: 'wrong-provider', expectedProvider };
  }

  if (match.expiredAt && Date.parse(match.expiredAt) < Date.now()) {
    return { status: 'expired' };
  }

  if (isRedeemed(code)) return { status: 'already-used' };

  const provider = getProvider(match.providerId);
  if (!provider) return { status: 'invalid' };
  return { status: 'valid', tokens: match.tokens, provider };
}
