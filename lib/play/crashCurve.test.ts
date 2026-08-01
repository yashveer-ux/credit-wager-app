import { describe, expect, it } from '@jest/globals';

import {
  CRASH_TIME_CONSTANT,
  crashIntensity,
  displayedMultiplierAtElapsed,
  elapsedSecondsForMultiplier,
} from './crashCurve';

describe('displayedMultiplierAtElapsed', () => {
  it('starts at 1x', () => {
    expect(displayedMultiplierAtElapsed(0, 10)).toBe(1);
    expect(displayedMultiplierAtElapsed(-1, 10)).toBe(1);
  });

  it('grows continuously and monotonically over time', () => {
    const a = displayedMultiplierAtElapsed(1, 50);
    const b = displayedMultiplierAtElapsed(2, 50);
    const c = displayedMultiplierAtElapsed(3, 50);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('caps at the hidden crash point and never exceeds it', () => {
    expect(displayedMultiplierAtElapsed(1000, 5)).toBe(5);
    expect(displayedMultiplierAtElapsed(CRASH_TIME_CONSTANT * 10, 3.5)).toBe(3.5);
  });
});

describe('elapsedSecondsForMultiplier', () => {
  it('reaches ~2x within a few seconds (good pacing)', () => {
    const t = elapsedSecondsForMultiplier(2);
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(6);
  });

  it('reaches the 50x max well under a minute', () => {
    const t = elapsedSecondsForMultiplier(50);
    expect(t).toBeLessThan(30);
  });

  it('is the inverse of displayedMultiplierAtElapsed below the crash point', () => {
    const m = 7.3;
    const t = elapsedSecondsForMultiplier(m);
    expect(displayedMultiplierAtElapsed(t, 50)).toBeCloseTo(m, 5);
  });
});

describe('crashIntensity', () => {
  it('is 0 at or below 1x', () => {
    expect(crashIntensity(1)).toBe(0);
    expect(crashIntensity(0.5)).toBe(0);
  });

  it('is clamped to a max of 1', () => {
    expect(crashIntensity(12)).toBeCloseTo(1, 5);
    expect(crashIntensity(1000)).toBe(1);
  });

  it('increases monotonically with the displayed multiplier', () => {
    expect(crashIntensity(3)).toBeLessThan(crashIntensity(6));
    expect(crashIntensity(6)).toBeLessThan(crashIntensity(11));
  });
});
