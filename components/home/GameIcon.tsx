import { Image, type ImageSourcePropType } from 'react-native';

import type { GameId } from '../../lib/play/types';

const ICONS: Record<GameId, ImageSourcePropType> = {
  blackjack: require('../../assets/games/blackjack.png'),
  roulette: require('../../assets/games/roulette.png'),
  crash: require('../../assets/games/crash.png'),
  chambers: require('../../assets/games/chambers.png'),
  'human-or-ai': require('../../assets/games/human-or-ai.png'),
};

export default function GameIcon({ gameId, size }: { gameId: GameId; size: number }) {
  return (
    <Image
      source={ICONS[gameId]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
