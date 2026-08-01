import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { haptics } from '../../lib/play/haptics';
import { colors, radius, space } from '../../lib/theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  /** Overrides the accent color (used for per-game accents). */
  color?: string;
};

function useScalePress(disabled?: boolean) {
  const [scale] = useState(() => new Animated.Value(1));
  const onPressIn = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  };
  return { scale, onPressIn, onPressOut };
}

export function PrimaryButton({ label, onPress, disabled, style, color }: ButtonProps) {
  const { scale, onPressIn, onPressOut } = useScalePress(disabled);
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => {
          haptics.select();
          onPress();
        }}
        style={[
          styles.primary,
          { backgroundColor: color ?? colors.accent },
          disabled && styles.disabled,
        ]}>
        <Text style={styles.primaryLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function GhostButton({ label, onPress, disabled, style, color }: ButtonProps) {
  const { scale, onPressIn, onPressOut } = useScalePress(disabled);
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => {
          haptics.select();
          onPress();
        }}
        style={[styles.ghost, disabled && styles.disabled]}>
        <Text style={[styles.ghostLabel, color ? { color } : null]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  primary: {
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  ghost: {
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ghostLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
