import { StyleSheet, Text, View } from 'react-native';

import { formatSignedTokens, formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

/** Two-column payout summary shown once the entered amount is valid. */
export default function SummaryCard({
  amount,
  fee,
  net,
  eta,
}: {
  amount: number;
  fee: number;
  net: number;
  eta: string;
}) {
  return (
    <View style={styles.card}>
      <Row label="Amount" value={formatTokens(amount)} />
      <Row label="Fee" value={fee > 0 ? formatSignedTokens(-fee) : 'Free'} />
      <View style={styles.divider} />
      <Row label="You receive" value={formatTokens(net)} emphasized />
      <Row label="Estimated arrival" value={eta} />
    </View>
  );
}

function Row({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, emphasized && styles.valueEmphasized]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm + 2,
    gap: space.md,
  },
  divider: { height: 1, backgroundColor: colors.border },
  label: { fontSize: 13, color: colors.muted },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  valueEmphasized: { fontSize: 15, fontWeight: '800' },
});
