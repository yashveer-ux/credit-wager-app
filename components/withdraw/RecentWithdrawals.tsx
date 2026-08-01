import { StyleSheet, Text, View } from 'react-native';

import { formatRelativeTime } from '../../lib/format';
import { useLedger } from '../../lib/ledger/ledgerStore';
import { formatSignedTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

const LIMIT = 5;

/** Latest withdrawal entries from the shared ledger, newest first. */
export default function RecentWithdrawals() {
  const withdrawals = useLedger()
    .filter((entry) => entry.kind === 'withdrawal')
    .slice(0, LIMIT);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Recent withdrawals</Text>
      {withdrawals.length === 0 ? (
        <Text style={styles.emptyText}>No withdrawals yet.</Text>
      ) : (
        withdrawals.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.main}>
              <Text style={styles.label} numberOfLines={1}>
                {entry.label}
              </Text>
              <Text style={styles.time}>{formatRelativeTime(entry.createdAt)}</Text>
            </View>
            {entry.status === 'demo' && (
              <View style={styles.demoChip}>
                <Text style={styles.demoChipLabel}>Demo</Text>
              </View>
            )}
            <Text style={styles.delta}>{formatSignedTokens(entry.delta)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.3,
    marginBottom: space.xs,
  },
  emptyText: { fontSize: 13, color: colors.muted, paddingVertical: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  main: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  time: { fontSize: 11, color: colors.muted, marginTop: 1 },
  demoChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm - 2,
    paddingVertical: 2,
  },
  demoChipLabel: { fontSize: 10, fontWeight: '700', color: colors.accent },
  delta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.negative,
    fontVariant: ['tabular-nums'],
  },
});
