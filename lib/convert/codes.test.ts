import { describe, expect, it } from '@jest/globals';

import { normalizeCode, validateCode } from './codes';
import { markRedeemed } from './redemptionStore';

describe('normalizeCode', () => {
  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(normalizeCode('  openai-500  ')).toBe('OPENAI-500');
    expect(normalizeCode('Claude-750')).toBe('CLAUDE-750');
  });
});

describe('validateCode', () => {
  it('accepts a known code for its matching provider, any casing', () => {
    const result = validateCode('openai', ' openai-500 ');
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.tokens).toBe(500);
      expect(result.provider.id).toBe('openai');
    }
  });

  it('rejects unknown and empty codes', () => {
    expect(validateCode('openai', 'NOT-A-CODE').status).toBe('invalid');
    expect(validateCode('openai', '   ').status).toBe('invalid');
  });

  it('flags a real code entered under the wrong provider', () => {
    const result = validateCode('mistral', 'CLAUDE-750');
    expect(result.status).toBe('wrong-provider');
    if (result.status === 'wrong-provider') {
      expect(result.expectedProvider.id).toBe('anthropic');
    }
  });

  it('flags expired codes', () => {
    expect(validateCode('openai', 'OPENAI-LAUNCH').status).toBe('expired');
  });

  it('flags already-redeemed codes', () => {
    markRedeemed('GEMINI-300');
    expect(validateCode('gemini', 'GEMINI-300').status).toBe('already-used');
  });
});
