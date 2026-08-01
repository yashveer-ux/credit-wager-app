import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import FeaturedChallenges from '../../components/home/FeaturedChallenges';
import GameIcon from '../../components/home/GameIcon';
import HomeHeader from '../../components/home/HomeHeader';
import { fetchHome, type HomeData } from '../../lib/mock';
import { GAMES } from '../../lib/play/games';
import { usePlayHistory } from '../../lib/play/historyStore';
import { colors, radius, space } from '../../lib/theme';

const DAILY_GOAL = 3;
const DAILY_REWARD_LABEL = '+250';

// Size the five game tiles to exactly fill the row on the current screen, so
// no tile or label is cut off mid-word at the screen edge.
const GAME_TILE_GAP = space.sm + 2;
const GAME_TILE_WIDTH = Math.floor(
  (Dimensions.get('window').width - space.lg * 2 - GAME_TILE_GAP * 4) / 5
);
const GAME_CHIP_SIZE = GAME_TILE_WIDTH - 6;
const GAME_ART_SIZE = GAME_CHIP_SIZE - 12;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const history = usePlayHistory();

  useEffect(() => {
    let active = true;
    fetchHome().then((next) => active && setData(next));
    return () => {
      active = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setData(await fetchHome());
    setRefreshing(false);
  }, []);

  const today = new Date().toDateString();
  const winsToday = history.filter(
    (h) => h.delta > 0 && new Date(h.createdAt).toDateString() === today
  ).length;
  const dailyProgress = Math.min(winsToday, DAILY_GOAL);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxl },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />
      }>
      <HomeHeader displayName={data?.displayName ?? null} />

      <View style={styles.actions}>
        <QuickAction
          icon="swap-horizontal"
          title="Convert"
          subtitle="Swap & trade tokens"
          onPress={() => router.push('/convert')}
        />
        <QuickAction
          icon="game-controller"
          title="Play"
          subtitle="Games & challenges"
          featured
          onPress={() => router.push('/play')}
        />
      </View>

      <Section title="Games" onViewAll={() => router.push('/play')}>
        <View style={styles.gamesRow}>
          {GAMES.map((game) => (
            <Pressable
              key={game.id}
              accessibilityRole="button"
              accessibilityLabel={game.name}
              onPress={() => router.push(game.route as any)}
              style={({ pressed }) => [styles.gameTile, pressed && styles.pressed]}>
              <View style={[styles.gameIcon, { backgroundColor: game.accentSoft }]}>
                <GameIcon gameId={game.id} size={GAME_ART_SIZE} />
              </View>
              <Text style={styles.gameLabel} numberOfLines={2}>
                {game.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <FeaturedChallenges />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Daily Challenge"
        onPress={() => router.push('/play')}
        style={({ pressed }) => [styles.dailyCard, pressed && styles.pressed]}>
        <View style={styles.dailyIconWrap}>
          <Ionicons name="trophy" size={20} color={colors.positive} />
        </View>
        <View style={styles.dailyMain}>
          <Text style={styles.dailyTitle}>Daily Challenge</Text>
          <View style={styles.dailyProgressRow}>
            <Text style={styles.dailySubtitle}>Win {DAILY_GOAL} games today</Text>
            <Text style={styles.dailyFraction}>
              {dailyProgress}/{DAILY_GOAL}
            </Text>
          </View>
          <View style={styles.dailyTrack}>
            <View
              style={[styles.dailyFill, { width: `${(dailyProgress / DAILY_GOAL) * 100}%` }]}
            />
          </View>
        </View>
        <View style={styles.dailyRewardCol}>
          <Text style={styles.dailyRewardLabel}>Reward</Text>
          <Text style={styles.dailyRewardValue}>{DAILY_REWARD_LABEL}</Text>
          <Text style={styles.dailyRewardSub}>AI Credits</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

function QuickAction({
  icon,
  title,
  subtitle,
  onPress,
  featured = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  featured?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        featured && styles.actionFeatured,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.actionIcon, featured && styles.actionIconFeatured]}>
        <Ionicons name={icon} size={20} color={featured ? '#FFFFFF' : colors.accent} />
      </View>
      <View style={styles.actionTextCol}>
        <View style={styles.actionTitleRow}>
          <Text style={[styles.actionLabel, featured && styles.actionLabelFeatured]}>
            {title}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={featured ? 'rgba(255,255,255,0.85)' : colors.muted}
          />
        </View>
        <Text style={[styles.actionSubtitle, featured && styles.actionSubtitleFeatured]}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({
  title,
  onViewAll,
  children,
}: {
  title: string;
  onViewAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onViewAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View all ${title}`}
            hitSlop={8}
            onPress={onViewAll}
            style={styles.viewAllRow}>
            <Text style={styles.viewAllText}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.lg },

  actions: { flexDirection: 'row', gap: space.md },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  actionFeatured: { backgroundColor: colors.accent, borderColor: colors.accent },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  actionIconFeatured: { backgroundColor: 'rgba(255,255,255,0.2)' },
  actionTextCol: { flex: 1 },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  actionLabelFeatured: { color: '#FFFFFF' },
  actionSubtitle: { marginTop: 2, fontSize: 12, color: colors.muted },
  actionSubtitleFeatured: { color: 'rgba(255,255,255,0.85)' },
  pressed: { opacity: 0.7 },

  section: { gap: space.md },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '600', color: colors.muted },

  gamesRow: { flexDirection: 'row', gap: GAME_TILE_GAP },
  gameTile: { width: GAME_TILE_WIDTH, alignItems: 'center', gap: space.sm },
  gameIcon: {
    width: GAME_CHIP_SIZE,
    height: GAME_CHIP_SIZE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 14,
    minHeight: 28,
  },

  dailyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  dailyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4F6EE',
  },
  dailyMain: { flex: 1 },
  dailyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  dailyProgressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dailySubtitle: { fontSize: 12, color: colors.muted },
  dailyFraction: { fontSize: 12, fontWeight: '700', color: colors.positive },
  dailyTrack: {
    marginTop: space.sm - 2,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.skeleton,
    overflow: 'hidden',
  },
  dailyFill: { height: '100%', borderRadius: 3, backgroundColor: colors.positive },
  dailyRewardCol: { alignItems: 'flex-end' },
  dailyRewardLabel: { fontSize: 11, color: colors.muted },
  dailyRewardValue: { fontSize: 16, fontWeight: '800', color: colors.positive, marginTop: 1 },
  dailyRewardSub: { fontSize: 10, color: colors.muted },
});
