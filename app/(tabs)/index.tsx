import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatAmount } from '../../lib/format';
import { fetchHome, type HomeData } from '../../lib/mock';
import { useBalance } from '../../lib/play/balanceStore';
import { formatTokens } from '../../lib/play/format';
import { GAMES, getGame } from '../../lib/play/games';
import { usePlayHistory } from '../../lib/play/historyStore';
import type { GameMeta } from '../../lib/play/types';
import { colors, radius, space } from '../../lib/theme';

const FEATURED_CHALLENGE_IDS = ['human-or-ai', 'crash'] as const;
const DAILY_GOAL = 3;
const DAILY_REWARD_LABEL = '+250';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { balance: tokenBalance } = useBalance();
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
      <View style={styles.headerRow}>
        {data ? (
          <Text style={styles.greeting}>Hi, {data.displayName} 👋</Text>
        ) : (
          <Skeleton width={140} height={26} />
        )}

        <View style={styles.headerRight}>
          {data ? (
            <View style={styles.headerBalance}>
              <Ionicons name="wallet" size={13} color={colors.accent} />
              <Text style={styles.headerBalanceText} numberOfLines={1}>
                {formatAmount(data.cashBalance, 'SIM_CASH')}
              </Text>
            </View>
          ) : (
            <Skeleton width={88} height={30} radius={radius.sm} />
          )}
          <Avatar />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AI Credits"
        onPress={() => router.push('/play')}
        style={({ pressed }) => [styles.creditsCard, pressed && styles.pressed]}>
        <View style={styles.creditsIcon}>
          <Ionicons name="hardware-chip" size={20} color={colors.accent} />
        </View>
        <View style={styles.creditsText}>
          <Text style={styles.creditsLabel}>AI Credits</Text>
          <Text style={styles.creditsValue}>{formatTokens(tokenBalance)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gamesRow}>
          {GAMES.map((game) => (
            <Pressable
              key={game.id}
              accessibilityRole="button"
              accessibilityLabel={game.name}
              onPress={() => router.push(game.route as any)}
              style={({ pressed }) => [styles.gameTile, pressed && styles.pressed]}>
              <View style={[styles.gameIcon, { backgroundColor: game.accentSoft }]}>
                <Ionicons
                  name={game.icon as keyof typeof Ionicons.glyphMap}
                  size={26}
                  color={game.accent}
                />
              </View>
              <Text style={styles.gameLabel} numberOfLines={2}>
                {game.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      <Section title="Featured Challenges" onViewAll={() => router.push('/play')}>
        <View style={styles.challengeRow}>
          {FEATURED_CHALLENGE_IDS.map((id) => {
            const game = getGame(id)!;
            return game.id === 'crash' ? (
              <DarkChallengeCard
                key={id}
                game={game}
                onPress={() => router.push(game.route as any)}
              />
            ) : (
              <LightChallengeCard
                key={id}
                game={game}
                onPress={() => router.push(game.route as any)}
              />
            );
          })}
        </View>
      </Section>

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
              style={[
                styles.dailyFill,
                { width: `${(dailyProgress / DAILY_GOAL) * 100}%` },
              ]}
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

function Avatar() {
  return (
    <View style={styles.avatar}>
      <Ionicons name="person" size={19} color={colors.muted} />
    </View>
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

function LightChallengeCard({ game, onPress }: { game: GameMeta; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={game.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.challengeCard,
        styles.challengeCardLight,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.challengeThumb, { backgroundColor: game.accentSoft }]}>
        <Ionicons
          name={game.icon as keyof typeof Ionicons.glyphMap}
          size={28}
          color={game.accent}
        />
      </View>
      <Text style={styles.challengeTitle}>{game.name}</Text>
      <Text style={styles.challengeBody} numberOfLines={2}>
        {game.description}
      </Text>
      <View style={styles.challengeFooterRow}>
        <View style={[styles.challengeBadge, { backgroundColor: game.accentSoft }]}>
          <Text style={[styles.challengeBadgeText, { color: game.accent }]}>
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
      style={({ pressed }) => [
        styles.challengeCard,
        styles.challengeCardDark,
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={game.icon as keyof typeof Ionicons.glyphMap}
        size={76}
        color="rgba(255,255,255,0.10)"
        style={styles.challengeDarkGlyph}
      />
      <Text style={styles.challengeTitleDark}>{game.name}</Text>
      <Text style={styles.challengeBodyDark}>{game.tagline}</Text>
      <View style={styles.challengeDarkDivider} />
      <Text style={styles.challengeStatDark}>
        Up to {game.maxMultiplierLabel} · min {formatTokens(game.minWager)}
      </Text>
    </Pressable>
  );
}

function Skeleton({
  width,
  height,
  radius: r = radius.sm,
  style,
}: {
  width: number;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[{ width, height, borderRadius: r, backgroundColor: colors.skeleton }, style]}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.lg },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  headerBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
  },
  headerBalanceText: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.skeleton,
    borderWidth: 1,
    borderColor: colors.border,
  },

  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  creditsIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  creditsText: { flex: 1 },
  creditsLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  creditsValue: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },

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

  gamesRow: { flexDirection: 'row', gap: space.md, paddingRight: space.sm },
  gameTile: { width: 76, alignItems: 'center', gap: space.sm },
  gameIcon: {
    width: 60,
    height: 60,
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

  challengeRow: { flexDirection: 'row', gap: space.md },
  challengeCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs + 2,
    minHeight: 176,
  },
  challengeCardLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  challengeThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space.xs },
  challengeBody: { fontSize: 12, color: colors.muted, lineHeight: 16, flex: 1 },
  challengeFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  challengeBadge: { paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.sm },
  challengeBadgeText: { fontSize: 11, fontWeight: '700' },

  challengeCardDark: {
    backgroundColor: colors.text,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  challengeDarkGlyph: { position: 'absolute', right: -10, bottom: -10 },
  challengeTitleDark: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  challengeBodyDark: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 16 },
  challengeDarkDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: space.xs + 2,
  },
  challengeStatDark: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

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
