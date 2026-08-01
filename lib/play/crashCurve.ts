/**
 * Pure timing/visual-intensity helpers for the Neural Crash round, kept
 * separate from the screen component so the growth curve can be unit
 * tested without React Native.
 */

/** Seconds it takes the curve to grow by one natural-log unit (e^1 ≈ 2.72x). */
export const CRASH_TIME_CONSTANT = 6;

/**
 * Smooth, continuously-growing "displayed" multiplier as a function of
 * elapsed round time, capped at the (hidden) crash point. Roughly: ~2x at
 * ~4s in, ~10x at ~14s, the 50x max at ~24s — a few seconds for a modest
 * multiplier, well under a minute for the maximum.
 */
export function displayedMultiplierAtElapsed(elapsedSeconds: number, crashPoint: number): number {
  if (elapsedSeconds <= 0) return 1;
  const grown = Math.exp(elapsedSeconds / CRASH_TIME_CONSTANT);
  return Math.min(crashPoint, grown);
}

/** Inverse of the growth curve: elapsed seconds needed to reach `multiplier`. */
export function elapsedSecondsForMultiplier(multiplier: number): number {
  return CRASH_TIME_CONSTANT * Math.log(Math.max(1, multiplier));
}

/**
 * 0..1 "overload" intensity used to drive the neural-network visual (pulse
 * speed, jitter, color shift toward red). Reaches 1 around 12x displayed so
 * most rounds — which tend to crash well below that — still show a visible
 * ramp instead of maxing out immediately.
 */
export function crashIntensity(displayedMultiplier: number): number {
  const t = Math.log(Math.max(1, displayedMultiplier)) / Math.log(12);
  return Math.min(1, Math.max(0, t));
}
