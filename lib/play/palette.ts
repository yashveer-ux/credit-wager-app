/**
 * Per-game accent colors, layered on top of the app's dark casino theme
 * rather than modifying `lib/theme.ts`. Backgrounds, surfaces, text, and
 * spacing all stay on the shared tokens — only icon chips, headers, and
 * game-specific accents use these. Accents are tuned bright enough to read
 * on the dark felt; `accentSoft` values are deep tinted chip backgrounds.
 */

export const gamePalette = {
  blackjack: { accent: '#3FBF8C', accentSoft: '#17452E' },
  roulette: { accent: '#E25C55', accentSoft: '#3B1D18' },
  crash: { accent: '#A88BFF', accentSoft: '#2C2448' },
  chambers: { accent: '#48C2D8', accentSoft: '#123A42' },
  humanOrAi: { accent: '#C9D1DB', accentSoft: '#2A3540' },
} as const;
