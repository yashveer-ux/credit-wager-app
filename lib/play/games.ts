import { gamePalette } from './palette';
import type { GameMeta } from './types';

export const FEATURED_GAME_ID = 'crash';

export const GAMES: GameMeta[] = [
  {
    id: 'blackjack',
    route: '/play/blackjack',
    name: 'Blackjack',
    tagline: 'Beat the dealer to 21',
    description: 'Classic single-player blackjack against an AI dealer. Hit, stand, or double down.',
    risk: 'medium',
    minWager: 10,
    maxMultiplierLabel: '2.5×',
    icon: 'albums',
    accent: gamePalette.blackjack.accent,
    accentSoft: gamePalette.blackjack.accentSoft,
  },
  {
    id: 'roulette',
    route: '/play/roulette',
    name: 'Roulette',
    tagline: 'Single-zero European wheel',
    description: 'Bet on numbers, colors, or ranges and watch the wheel decide.',
    risk: 'high',
    minWager: 5,
    maxMultiplierLabel: '36×',
    icon: 'disc',
    accent: gamePalette.roulette.accent,
    accentSoft: gamePalette.roulette.accentSoft,
  },
  {
    id: 'crash',
    route: '/play/crash',
    name: 'Neural Crash',
    tagline: 'Cash out before it overloads',
    description: 'A rising multiplier fed by an unstable model. Eject before it crashes.',
    risk: 'extreme',
    minWager: 5,
    maxMultiplierLabel: '50×',
    icon: 'rocket',
    accent: gamePalette.crash.accent,
    accentSoft: gamePalette.crash.accentSoft,
  },
  {
    id: 'chambers',
    route: '/play/chambers',
    name: 'Six Chambers',
    tagline: 'Five safe cores, one live wire',
    description: 'Open digital chambers one at a time. Bank your multiplier whenever you like.',
    risk: 'high',
    minWager: 10,
    maxMultiplierLabel: '5.76×',
    icon: 'grid',
    accent: gamePalette.chambers.accent,
    accentSoft: gamePalette.chambers.accentSoft,
  },
  {
    id: 'human-or-ai',
    route: '/play/human-or-ai',
    name: 'Turing Bet',
    tagline: 'Spot the synthetic one',
    description: 'Decide if each piece of text was written by a human or a machine. Streak to multiply.',
    risk: 'medium',
    minWager: 10,
    maxMultiplierLabel: '10×',
    icon: 'contrast',
    accent: gamePalette.humanOrAi.accent,
    accentSoft: gamePalette.humanOrAi.accentSoft,
  },
];

export function getGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

export const RISK_LABEL: Record<GameMeta['risk'], string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  extreme: 'Extreme risk',
};
