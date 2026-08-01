import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GameCard from '../../components/play/GameCard';
import { formatRelativeTime } from '../../lib/format';
import { topUpBalance, useBalance } from '../../lib/play/balanceStore';
import { claimFaucet } from '../../lib/play/sync';
import { formatSignedTokens, formatTokens } from '../../lib/play/format';
import { FEATURED_GAME_ID, GAMES, getGame } from '../../lib/play/games';
import { usePlayHistory } from '../../lib/play/historyStore';
import { colors, radius, space } from '../../lib/theme';

export default function PlayLobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { balance, hydrated } = useBalance();
  const history = usePlayHistory();

  const featured = getGame(FEATURED_GAME_ID)!;
  const rest = GAMES.filter((g) => g.id !== featured.id);

  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onResetPress = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      resetTimer.current = setTimeout(() => setConfirmingReset(false), 3000);
      return;
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    // Credit locally for an instant balance, and queue the matching grant so
    // the ledger agrees.
    claimFaucet(topUpBalance());
    setConfirmingReset(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxl },
      ]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Play</Text>
        <Pressable onPress={onResetPress} hitSlop={8}>
          <Text style={[styles.resetLink, confirmingReset && styles.resetLinkConfirm]}>
            {confirmingReset ? 'Tap again to confirm' : 'Top up +5,000'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>AI Token balance</Text>
        <Text style={styles.balanceValue}>{hydrated ? formatTokens(balance) : '—'}</Text>
        <Text style={styles.balanceHint}>Virtual tokens for demo play. No real-world value.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Featured</Text>
        <GameCard game={featured} featured onPress={() => router.push(featured.route as any)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Online</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Online Blackjack"
          onPress={() => router.push('/play/online-blackjack' as any)}
          style={styles.onlineCard}>
          <View style={[styles.onlineIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="people" size={22} color={colors.accent} />
          </View>
          <View style={styles.onlineText}>
            <Text style={styles.onlineTitle}>Online Blackjack</Text>
            <Text style={styles.onlineSubtitle}>Live tables against real players</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rewards and promo codes"
          onPress={() => router.push('/play/rewards' as any)}
          style={styles.onlineCard}>
          <View style={[styles.onlineIcon, { backgroundColor: '#E4F6EE' }]}>
            <Ionicons name="gift" size={22} color={colors.positive} />
          </View>
          <View style={styles.onlineText}>
            <Text style={styles.onlineTitle}>Rewards & promo codes</Text>
            <Text style={styles.onlineSubtitle}>Claim rewards or redeem a code</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All games</Text>
        <View style={{ gap: space.md }}>
          {rest.map((game) => (
            <GameCard key={game.id} game={game} onPress={() => router.push(game.route as any)} />
          ))}
        </View>
      </View>

      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent rounds</Text>
          <View style={styles.historyCard}>
            {history.slice(0, 5).map((entry, i) => {
              const game = getGame(entry.gameId);
              const positive = entry.delta >= 0;
              return (
                <View key={entry.id} style={[styles.historyRow, i > 0 && styles.historyDivider]}>
                  <View style={[styles.historyIcon, { backgroundColor: game?.accentSoft }]}>
                    <Ionicons
                      name={(game?.icon ?? 'game-controller') as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={game?.accent ?? colors.muted}
                    />
                  </View>
                  <View style={styles.historyText}>
                    <Text style={styles.historyTitle}>{entry.label}</Text>
                    <Text style={styles.historySubtitle}>
                      {game?.name ?? 'Game'} · {formatRelativeTime(entry.createdAt)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.historyAmount,
                      { color: positive ? colors.positive : colors.negative },
                    ]}>
                    {formatSignedTokens(entry.delta)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <Text style={styles.disclaimer}>
        AI Tokens are a virtual demo currency with no real-world value. There are no deposits,
        purchases, or withdrawals — reset your balance anytime.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.lg },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  resetLink: { fontSize: 13, fontWeight: '600', color: colors.muted },
  resetLinkConfirm: { color: colors.negative },

  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
  },
  balanceLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, letterSpacing: 0.3 },
  balanceValue: {
    marginTop: space.sm,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  balanceHint: { marginTop: space.xs, fontSize: 12, color: colors.muted },

  section: { gap: space.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },

  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  onlineIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineText: { flex: 1 },
  onlineTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  onlineSubtitle: { marginTop: 2, fontSize: 13, color: colors.muted },

  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md + 2 },
  historyDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyText: { flex: 1 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  historySubtitle: { marginTop: 2, fontSize: 12, color: colors.muted },
  historyAmount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

  disclaimer: { fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 16 },
});
