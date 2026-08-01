import { describe, expect, it } from '@jest/globals';

import { TURING_BET_CONTENT } from './content';

describe('TURING_BET_CONTENT', () => {
  it('has a balanced number of AI and human items', () => {
    const aiCount = TURING_BET_CONTENT.filter((item) => item.isAI).length;
    const humanCount = TURING_BET_CONTENT.filter((item) => !item.isAI).length;
    expect(aiCount).toBe(humanCount);
  });

  it('gives every item a non-empty explanation', () => {
    for (const item of TURING_BET_CONTENT) {
      expect(item.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every item a non-empty text', () => {
    for (const item of TURING_BET_CONTENT) {
      expect(item.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = TURING_BET_CONTENT.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least 10 items so a full run never repeats content', () => {
    expect(TURING_BET_CONTENT.length).toBeGreaterThanOrEqual(10);
  });
});
