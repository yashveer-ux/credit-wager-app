import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { formatTokens } from '../../lib/play/format';
import { useBalance } from '../../lib/play/balanceStore';
import { colors, radius, space } from '../../lib/theme';

export default function BalancePill({ compact = false }: { compact?: boolean }) {
  const { balance } = useBalance();
  return (
    <View style={[styles.pill, compact && styles.pillCompact]}>
      <Ionicons name="hardware-chip" size={compact ? 13 : 15} color={colors.accent} />
      <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
        {formatTokens(balance)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
  },
  pillCompact: { paddingHorizontal: space.sm + 2, paddingVertical: 4 },
  text: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  textCompact: { fontSize: 12 },
});
