import { StyleSheet, Text, View } from 'react-native';

import { formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

export default function BalanceCard({ balance }: { balance: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Available to withdraw</Text>
      <Text style={styles.value}>{formatTokens(balance)}</Text>
      <Text style={styles.caption}>AI Tokens</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    gap: 2,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted },
  value: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  caption: { fontSize: 12, fontWeight: '600', color: colors.accent },
});
