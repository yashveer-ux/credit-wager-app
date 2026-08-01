import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { Achievement } from '../../lib/rewards/types';
import { colors, radius, space } from '../../lib/theme';

export default function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const { title, description, icon, unlocked } = achievement;
  return (
    <View style={[styles.card, !unlocked && styles.cardLocked]}>
      <View style={[styles.iconWrap, unlocked ? styles.iconUnlocked : styles.iconLocked]}>
        <Ionicons
          name={unlocked ? icon : 'lock-closed'}
          size={20}
          color={unlocked ? colors.accent : colors.muted}
        />
      </View>
      <Text style={[styles.title, !unlocked && styles.titleLocked]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>
      {unlocked ? (
        <View style={styles.checkRow}>
          <Ionicons name="checkmark-circle" size={13} color={colors.positive} />
          <Text style={styles.unlockedText}>Unlocked</Text>
        </View>
      ) : (
        <Text style={styles.lockedText}>Locked</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 4,
  },
  cardLocked: { opacity: 0.6 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconUnlocked: { backgroundColor: colors.accentSoft },
  iconLocked: { backgroundColor: colors.skeleton },
  title: { fontSize: 13, fontWeight: '700', color: colors.text },
  titleLocked: { color: colors.muted },
  description: { fontSize: 11, color: colors.muted, lineHeight: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  unlockedText: { fontSize: 11, fontWeight: '700', color: colors.positive },
  lockedText: { fontSize: 11, fontWeight: '600', color: colors.muted, marginTop: 2 },
});
