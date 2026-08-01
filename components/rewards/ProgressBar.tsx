import { StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';

export default function ProgressBar({
  progress,
  color = colors.accent,
  trackColor = colors.skeleton,
  height = 6,
}: {
  /** 0..1 */
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          { width: `${pct}%`, backgroundColor: color, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
});
