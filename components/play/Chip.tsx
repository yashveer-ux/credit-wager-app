import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';

type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';

const TONE_COLORS: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.skeleton, fg: colors.muted },
  positive: { bg: '#15452B', fg: colors.positive },
  negative: { bg: '#3B1D18', fg: colors.negative },
  warning: { bg: '#3A3013', fg: '#DFB44A' },
  accent: { bg: colors.accentSoft, fg: colors.accent },
};

export default function Chip({
  label,
  tone = 'neutral',
  color,
  backgroundColor,
}: {
  label: string;
  tone?: Tone;
  /** Overrides the tone's foreground color (used for per-game accents). */
  color?: string;
  /** Overrides the tone's background color (used for per-game accents). */
  backgroundColor?: string;
}) {
  const t = TONE_COLORS[tone];
  return (
    <View style={[styles.chip, { backgroundColor: backgroundColor ?? t.bg }]}>
      <Text style={[styles.label, { color: color ?? t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});
