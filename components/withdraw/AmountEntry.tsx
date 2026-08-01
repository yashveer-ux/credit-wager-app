import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatTokens } from '../../lib/play/format';
import { haptics } from '../../lib/play/haptics';
import { colors, radius, space } from '../../lib/theme';

const PRESETS = [100, 500, 1000];

/**
 * Large centered whole-token amount input with preset chips and inline
 * validation. The parent owns the raw digit string and all validation
 * rules; this component is purely presentational plus tap plumbing.
 */
export default function AmountEntry({
  value,
  amount,
  minAmount,
  maxAmount,
  error,
  disabled,
  onChangeText,
  onPreset,
}: {
  /** Raw digits currently typed ('' when empty). */
  value: string;
  /** Parsed integer amount (0 when empty). */
  amount: number;
  /** Smallest accepted withdrawal, for the idle hint text. */
  minAmount: number;
  /** Largest whole-token amount currently affordable (the Max chip). */
  maxAmount: number;
  /** Inline validation message, or null when the entry is empty/valid. */
  error: string | null;
  disabled: boolean;
  onChangeText: (text: string) => void;
  onPreset: (amount: number) => void;
}) {
  const pressPreset = (preset: number) => {
    haptics.select();
    onPreset(preset);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Withdraw amount</Text>

      <TextInput
        accessibilityLabel="Withdrawal amount in tokens"
        style={[styles.input, disabled && styles.dimmed]}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        keyboardType="number-pad"
        keyboardAppearance="dark"
        placeholder="0"
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        textAlign="center"
      />

      <Text style={[styles.hint, error !== null && styles.error]}>
        {error ?? `Minimum withdrawal ${formatTokens(minAmount)} tokens`}
      </Text>

      <View style={styles.presetRow}>
        {PRESETS.map((preset) => {
          const active = amount === preset && value !== '';
          return (
            <Pressable
              key={preset}
              accessibilityRole="button"
              accessibilityLabel={`Set amount to ${formatTokens(preset)} tokens`}
              disabled={disabled}
              onPress={() => pressPreset(preset)}
              style={[styles.chip, active && styles.chipActive, disabled && styles.dimmed]}>
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {formatTokens(preset)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set amount to your full balance"
          disabled={disabled || maxAmount <= 0}
          onPress={() => pressPreset(maxAmount)}
          style={[
            styles.chip,
            amount === maxAmount && maxAmount > 0 && value !== '' && styles.chipActive,
            (disabled || maxAmount <= 0) && styles.dimmed,
          ]}>
          <Text
            style={[
              styles.chipLabel,
              amount === maxAmount && maxAmount > 0 && value !== '' && styles.chipLabelActive,
            ]}>
            Max
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  input: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    paddingVertical: space.sm,
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
  },
  error: { color: colors.negative },
  presetRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space.lg,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  chipLabelActive: { color: colors.accent },
  dimmed: { opacity: 0.4 },
});
