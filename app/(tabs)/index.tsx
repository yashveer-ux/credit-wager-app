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

import { formatAmount, formatRelativeTime, formatSigned } from '../../lib/format';
import {
  CREDIT_TYPES,
  TRANSACTION_LABELS,
  fetchHome,
  type HomeData,
  type Transaction,
  type TransactionType,
} from '../../lib/mock';
import { colors, radius, space } from '../../lib/theme';

const TX_ICONS: Record<TransactionType, keyof typeof Ionicons.glyphMap> = {
  CONVERSION_IN: 'arrow-down',
  CONVERSION_OUT: 'arrow-up',
  WAGER: 'dice',
  PAYOUT: 'trophy',
  ADJUSTMENT: 'options',
};

// Placeholder slots — the actual game hasn't been chosen yet.
const GAME_SLOTS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'dice-outline', label: 'Coming soon' },
  { icon: 'flash-outline', label: 'Coming soon' },
  { icon: 'layers-outline', label: 'Coming soon' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
      {data ? (
        <Text style={styles.greeting}>Hi, {data.displayName}</Text>
      ) : (
        <Skeleton width={120} height={20} />
      )}

      <BalanceHero balance={data?.cashBalance ?? null} />

      <View style={styles.actions}>
        <QuickAction icon="swap-horizontal" label="Convert" onPress={() => router.push('/convert')} />
        <QuickAction icon="game-controller" label="Play" onPress={() => router.push('/play')} />
      </View>

      <Section title="Games">
        <View style={styles.gameGrid}>
          {GAME_SLOTS.map((slot, i) => (
            <View key={i} style={styles.gameTile}>
              <Ionicons name={slot.icon} size={22} color={colors.muted} />
              <Text style={styles.gameLabel}>{slot.label}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Recent activity">
        {data === null ? (
          <View style={styles.card}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
                <Skeleton width={36} height={36} radius={18} />
                <View style={styles.rowText}>
                  <Skeleton width={130} height={14} />
                  <Skeleton width={80} height={12} style={{ marginTop: space.xs + 2 }} />
                </View>
                <Skeleton width={70} height={14} />
              </View>
            ))}
          </View>
        ) : data.recentTransactions.length === 0 ? (
          <EmptyActivity />
        ) : (
          <View style={styles.card}>
            {data.recentTransactions.map((tx, i) => (
              <ActivityRow key={tx.id} tx={tx} divider={i > 0} />
            ))}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

function BalanceHero({ balance }: { balance: number | null }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>Cash balance</Text>
      {balance === null ? (
        <Skeleton width={200} height={44} style={{ marginTop: space.sm }} />
      ) : (
        <Text style={styles.heroValue}>{formatAmount(balance, 'SIM_CASH')}</Text>
      )}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function ActivityRow({ tx, divider }: { tx: Transaction; divider: boolean }) {
  const positive = tx.amount > 0;
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <Ionicons name={TX_ICONS[tx.type]} size={16} color={colors.muted} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{TRANSACTION_LABELS[tx.type]}</Text>
        <Text style={styles.rowSubtitle}>
          {CREDIT_TYPES[tx.creditTypeCode].displayName} · {formatRelativeTime(tx.createdAt)}
        </Text>
      </View>
      <Text style={[styles.rowAmount, { color: positive ? colors.positive : colors.negative }]}>
        {formatSigned(tx.amount, tx.creditTypeCode)}
      </Text>
    </View>
  );
}

function EmptyActivity() {
  return (
    <View style={[styles.card, styles.empty]}>
      <Ionicons name="receipt-outline" size={26} color={colors.muted} />
      <Text style={styles.emptyTitle}>No activity yet</Text>
      <Text style={styles.emptyBody}>Convert cash into credits to get started.</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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

  greeting: { fontSize: 16, fontWeight: '600', color: colors.muted },

  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
  },
  heroLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, letterSpacing: 0.3 },
  heroValue: {
    marginTop: space.sm,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },

  actions: { flexDirection: 'row', gap: space.md },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.6 },

  section: { gap: space.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },

  gameGrid: { flexDirection: 'row', gap: space.md },
  gameTile: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  gameLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSubtitle: { marginTop: 2, fontSize: 12, color: colors.muted },
  rowAmount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.muted },
});
