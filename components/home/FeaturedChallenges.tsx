import { useRouter } from 'expo-router';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { formatTokens } from '../../lib/play/format';
import { getGame } from '../../lib/play/games';
import type { GameMeta } from '../../lib/play/types';
import { colors, radius, space } from '../../lib/theme';
import GameIcon from './GameIcon';

// Exactly two distinct featured games, matching the mock's light + dark pairing.
// Each id is looked up individually (not mapped over a repeating list) so there
// is no risk of accidentally rendering the same card twice.
const LIGHT_CARD_GAME_ID = 'human-or-ai';
const DARK_CARD_GAME_ID = 'crash';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - space.lg * 2 - space.md) / 2;

export default function FeaturedChallenges() {
  const router = useRouter();

  const lightGame = getGame(LIGHT_CARD_GAME_ID);
  const darkGame = getGame(DARK_CARD_GAME_ID);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Featured Challenges</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all Featured Challenges"
          hitSlop={8}
          onPress={() => router.push('/play')}
          style={styles.viewAllRow}>
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {lightGame ? (
          <LightChallengeCard game={lightGame} onPress={() => router.push(lightGame.route as any)} />
        ) : null}
        {darkGame ? (
          <DarkChallengeCard game={darkGame} onPress={() => router.push(darkGame.route as any)} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function LightChallengeCard({ game, onPress }: { game: GameMeta; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={game.name}
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.cardLight, pressed && styles.pressed]}>
      <View style={[styles.thumbWrap, { backgroundColor: game.accentSoft }]}>
        <GameIcon gameId={game.id} size={48} />
      </View>
      <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
        {game.name}
      </Text>
      <Text style={styles.body} numberOfLines={2} ellipsizeMode="tail">
        {game.description}
      </Text>
      <View style={styles.footerRow}>
        <View style={[styles.badge, { backgroundColor: game.accentSoft }]}>
          <Text style={[styles.badgeText, { color: game.accent }]} numberOfLines={1}>
            Up to {game.maxMultiplierLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function DarkChallengeCard({ game, onPress }: { game: GameMeta; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={game.name}
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.cardDark, pressed && styles.pressed]}>
      <View style={styles.thumbWrapDark}>
        <GameIcon gameId={game.id} size={48} />
      </View>
      <Text style={styles.titleDark} numberOfLines={1} ellipsizeMode="tail">
        {game.name}
      </Text>
      <Text style={styles.bodyDark} numberOfLines={2} ellipsizeMode="tail">
        {game.tagline}
      </Text>
      <View style={styles.darkDivider} />
      <Text style={styles.statDark} numberOfLines={1} ellipsizeMode="tail">
        Up to {game.maxMultiplierLabel} · min {formatTokens(game.minWager)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '600', color: colors.muted },

  scrollContent: { gap: space.md, paddingRight: space.lg },

  card: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs + 2,
    minHeight: 200,
  },
  cardLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDark: {
    backgroundColor: colors.text,
  },
  pressed: { opacity: 0.85 },

  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbWrapDark: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space.xs },
  body: { fontSize: 12, color: colors.muted, lineHeight: 16, flex: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    flexShrink: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  titleDark: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginTop: space.xs },
  bodyDark: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 16 },
  darkDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: space.xs + 2,
  },
  statDark: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
});
