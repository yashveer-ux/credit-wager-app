import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import GameIcon from '../home/GameIcon';
import { formatTokens } from '../../lib/play/format';
import { RISK_LABEL } from '../../lib/play/games';
import type { GameMeta } from '../../lib/play/types';
import { colors, radius, space } from '../../lib/theme';
import Chip from './Chip';

const RISK_TONE = {
  low: 'positive',
  medium: 'accent',
  high: 'warning',
  extreme: 'negative',
} as const;

export default function GameCard({
  game,
  onPress,
  featured = false,
}: {
  game: GameMeta;
  onPress: () => void;
  featured?: boolean;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={game.name}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={[styles.card, featured && styles.cardFeatured]}>
        <View style={styles.topRow}>
          <View style={[styles.iconWrap, { backgroundColor: game.accentSoft }]}>
            <GameIcon gameId={game.id} size={featured ? 30 : 26} />
          </View>
          {featured ? <Chip label="Featured" tone="accent" /> : null}
        </View>

        <Text style={[styles.name, featured && styles.nameFeatured]}>{game.name}</Text>
        <Text style={styles.tagline}>{game.tagline}</Text>
        {featured ? <Text style={styles.description}>{game.description}</Text> : null}

        <View style={styles.footerRow}>
          <Chip label={RISK_LABEL[game.risk]} tone={RISK_TONE[game.risk]} />
          <Text style={styles.meta}>Min {formatTokens(game.minWager)}</Text>
          <Text style={[styles.meta, styles.metaStrong]}>Up to {game.maxMultiplierLabel}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.xs + 2,
  },
  cardFeatured: { padding: space.xl, gap: space.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: space.xs },
  nameFeatured: { fontSize: 20 },
  tagline: { fontSize: 13, color: colors.muted },
  description: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    marginTop: space.sm,
    flexWrap: 'wrap',
  },
  meta: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  metaStrong: { color: colors.text },
});
