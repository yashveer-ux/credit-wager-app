/**
 * "Recent redemptions" card: promo-kind ledger entries (already filtered by
 * the screen), each with the provider monogram, code label, relative time,
 * and the credited amount in green. Shows a friendly empty state when the
 * user hasn't redeemed anything yet.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { getProviderByName } from '../../lib/convert/codes';
import type { LedgerEntry } from '../../lib/ledger/ledgerStore';
import { formatRelativeTime } from '../../lib/format';
import { formatSignedTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';
import ProviderMonogram from './ProviderMonogram';

const MAX_ROWS = 6;

export default function RecentRedemptions({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <View style={styles.emptyIcon}>
          <Ionicons name="pricetags-outline" size={20} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>No redemptions yet</Text>
        <Text style={styles.emptyText}>Redeem your first promo code above to see it here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {entries.slice(0, MAX_ROWS).map((entry, i) => {
        const provider = getProviderByName(entry.provider);
        return (
          <View key={entry.id} style={[styles.row, i > 0 && styles.rowDivider]}>
            {provider ? (
              <ProviderMonogram provider={provider} size={36} />
            ) : (
              <View style={styles.fallbackIcon}>
                <Ionicons name="pricetag" size={16} color={colors.accent} />
              </View>
            )}
            <View style={styles.textCol}>
              <Text style={styles.label} numberOfLines={1}>
                {entry.label}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {provider?.name ?? entry.provider ?? 'Promo'} ·{' '}
                {formatRelativeTime(entry.createdAt)}
              </Text>
            </View>
            <Text style={styles.amount}>{formatSignedTokens(entry.delta)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  fallbackIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  textCol: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  subtitle: { marginTop: 1, fontSize: 12, color: colors.muted },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.positive,
    fontVariant: ['tabular-nums'],
  },

  emptyCard: { alignItems: 'center', paddingVertical: space.xl, gap: space.xs },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: space.xs,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});
