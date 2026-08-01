/**
 * Full-height, independently scrolling history view rendered inside the
 * profile sheet (the sheet switches into "history mode" — no navigation,
 * the bottom tab bar is never involved).
 *
 * Data comes from the unified ledger (`useUnifiedHistory`), which merges
 * game rounds, reward claims, promo redemptions, and demo withdrawals.
 * Filter chips narrow the list per kind; "All" doubles as the
 * balance-transactions view since every entry carries a signed delta and
 * the resulting balance.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatRelativeTime } from '../../lib/format';
import { useUnifiedHistory, type LedgerEntry, type LedgerKind } from '../../lib/ledger/ledgerStore';
import { formatSignedTokens, formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

type FilterKey = 'all' | LedgerKind;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'game', label: 'Games' },
  { key: 'promo', label: 'Promo codes' },
  { key: 'reward', label: 'Rewards' },
  { key: 'withdrawal', label: 'Withdrawals' },
];

const KIND_ICON: Record<LedgerKind, keyof typeof Ionicons.glyphMap> = {
  game: 'game-controller',
  reward: 'gift',
  promo: 'ticket',
  withdrawal: 'cash-outline',
};

export const KIND_LABEL: Record<LedgerKind, string> = {
  game: 'Game',
  reward: 'Reward',
  promo: 'Promo code',
  withdrawal: 'Withdrawal',
};

const EMPTY_STATE: Record<FilterKey, { icon: keyof typeof Ionicons.glyphMap; text: string }> = {
  all: { icon: 'time-outline', text: 'No activity yet — play a round or claim a reward.' },
  game: { icon: 'game-controller-outline', text: 'No game rounds yet — hit the Play tab.' },
  promo: { icon: 'ticket-outline', text: 'No promo codes redeemed yet.' },
  reward: { icon: 'gift-outline', text: 'No rewards claimed yet — check the Rewards tab.' },
  withdrawal: { icon: 'cash-outline', text: 'No withdrawals yet.' },
};

const STATUS_LABEL: Record<string, string> = {
  demo: 'Demo',
  completed: 'Completed',
};

export default function HistoryPanel() {
  const history = useUnifiedHistory();
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? history : history.filter((e) => e.kind === filter)),
    [history, filter]
  );

  return (
    <View style={styles.panel}>
      <View style={styles.filterStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${f.label}`}
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryEntryRow entry={item} />}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          style={styles.list}
        />
      )}
    </View>
  );
}

function HistoryEntryRow({ entry }: { entry: LedgerEntry }) {
  const positive = entry.delta >= 0;
  const statusLabel = entry.status ? (STATUS_LABEL[entry.status] ?? entry.status) : null;
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryIconWrap}>
        <Ionicons name={KIND_ICON[entry.kind]} size={17} color={colors.accent} />
      </View>
      <View style={styles.entryMain}>
        <View style={styles.entryLabelRow}>
          <Text style={styles.entryLabel} numberOfLines={2}>
            {entry.label}
          </Text>
          {statusLabel ? (
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>{statusLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.entrySub} numberOfLines={1}>
          {entry.provider ? `${entry.provider} · ` : ''}
          {formatRelativeTime(entry.createdAt)}
        </Text>
      </View>
      <View style={styles.entryRight}>
        <Text style={[styles.entryDelta, { color: positive ? colors.positive : colors.negative }]}>
          {formatSignedTokens(entry.delta)}
        </Text>
        <Text style={styles.entryBalance}>Bal {formatTokens(entry.balanceAfter)}</Text>
      </View>
    </View>
  );
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const empty = EMPTY_STATE[filter];
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={empty.icon} size={26} color={colors.muted} />
      </View>
      <Text style={styles.emptyText}>{empty.text}</Text>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: space.sm },

  filterStrip: { marginHorizontal: -space.lg },
  filterRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  filterChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterChipTextActive: { color: '#FFFFFF' },

  list: { flex: 1 },
  listContent: { paddingBottom: space.md },

  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
  },
  entryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  entryMain: { flex: 1, minWidth: 0, gap: 2 },
  entryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  entryLabel: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  entrySub: { fontSize: 11, color: colors.muted },
  statusChip: {
    paddingHorizontal: space.sm - 2,
    paddingVertical: 1,
    borderRadius: radius.sm - 2,
    backgroundColor: colors.skeleton,
  },
  statusChipText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  entryRight: { alignItems: 'flex-end', gap: 1 },
  entryDelta: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  entryBalance: { fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },

  separator: { height: 1, backgroundColor: colors.border },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.skeleton,
  },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
