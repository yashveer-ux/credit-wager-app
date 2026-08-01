import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

export function isValidWager(value: number, min: number, max: number): boolean {
  return value > 0 && value >= min && value <= max && Number.isFinite(value);
}

const DEFAULT_PRESETS = [10, 25, 100, 500];

export default function WagerBar({
  value,
  onChange,
  min,
  max,
  step = 5,
  presets = DEFAULT_PRESETS,
  disabled,
  accent,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  presets?: number[];
  disabled?: boolean;
  accent?: string;
}) {
  const color = accent ?? colors.accent;
  const clamp = (n: number) => Math.min(max, Math.max(0, n));

  const canAffordMin = max >= min;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Wager</Text>
        <Text style={styles.balanceHint}>Balance {formatTokens(max)}</Text>
      </View>

      <View style={styles.stepperRow}>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(clamp(value - step))}
          style={[styles.stepButton, disabled && styles.disabled]}>
          <Ionicons name="remove" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.value} numberOfLines={1}>
          {formatTokens(value)}
        </Text>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(clamp(value + step))}
          style={[styles.stepButton, disabled && styles.disabled]}>
          <Ionicons name="add" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.presetRow}>
        {presets.map((p) => (
          <Pressable
            key={p}
            disabled={disabled}
            onPress={() => onChange(clamp(p))}
            style={[
              styles.presetChip,
              value === p && { borderColor: color, backgroundColor: `${color}1A` },
              disabled && styles.disabled,
            ]}>
            <Text style={[styles.presetLabel, value === p && { color }]}>{formatTokens(p)}</Text>
          </Pressable>
        ))}
        <Pressable
          disabled={disabled}
          onPress={() => onChange(clamp(value * 2))}
          style={[styles.presetChip, disabled && styles.disabled]}>
          <Text style={styles.presetLabel}>×2</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(clamp(max))}
          style={[styles.presetChip, disabled && styles.disabled]}>
          <Text style={styles.presetLabel}>Max</Text>
        </Pressable>
      </View>

      {!canAffordMin && (
        <Text style={styles.error}>
          Not enough balance to place the minimum wager of {formatTokens(min)}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm + 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  balanceHint: { fontSize: 12, color: colors.muted },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  presetRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  presetChip: {
    paddingHorizontal: space.md,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  presetLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  disabled: { opacity: 0.4 },
  error: { fontSize: 12, color: colors.negative, fontWeight: '600' },
});
