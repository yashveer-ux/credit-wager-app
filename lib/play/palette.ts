/**
 * Per-game accent colors, layered on top of the app's existing theme rather
 * than modifying `lib/theme.ts`. Backgrounds, surfaces, text, and spacing all
 * stay on the shared tokens — only icon chips, headers, and game-specific
 * accents use these.
 */

export const gamePalette = {
  blackjack: { accent: '#0E7A50', accentSoft: '#E4F6EE' },
  roulette: { accent: '#B3122B', accentSoft: '#FBE7EA' },
  crash: { accent: '#6D28D9', accentSoft: '#EFE7FC' },
  chambers: { accent: '#0891A8', accentSoft: '#E3F5F8' },
  humanOrAi: { accent: '#334155', accentSoft: '#E8EBEF' },
} as const;
