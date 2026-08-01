import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { haptics } from '../../lib/play/haptics';
import { colors, radius, space } from '../../lib/theme';

/**
 * Full-width gold confirm button. While `processing` it keeps its accent
 * background and swaps the label for a spinner; taps are ignored via
 * `disabled` (the parent additionally holds a synchronous in-flight lock).
 */
export default function ConfirmButton({
  label,
  onPress,
  disabled,
  processing,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  processing: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || processing, busy: processing }}
      disabled={disabled || processing}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        disabled && !processing && styles.dimmed,
        pressed && styles.pressed,
      ]}>
      {processing ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  label: { fontSize: 15, fontWeight: '700', color: colors.onAccent },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.4 },
});
