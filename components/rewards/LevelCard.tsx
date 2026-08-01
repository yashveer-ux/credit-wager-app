import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';
import ProgressBar from './ProgressBar';

export default function LevelCard({
  level,
  levelTitle,
  xpIntoLevel,
  xpForNextLevel,
  xpProgress,
  streak,
}: {
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpProgress: number;
  streak: number;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.levelBadge}>
          <Ionicons name="star" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.levelLine}>
            Level {level} · {levelTitle}
          </Text>
          <Text style={styles.xpLine}>
            {xpIntoLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP to next level
          </Text>
        </View>
        <View style={styles.streakPill}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakText}>{streak}-day streak</Text>
        </View>
      </View>
      <ProgressBar progress={xpProgress} color="#FFFFFF" trackColor="rgba(255,255,255,0.22)" height={8} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  textCol: { flex: 1, gap: 2 },
  levelLine: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  xpLine: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  streakEmoji: { fontSize: 12 },
  streakText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
});
