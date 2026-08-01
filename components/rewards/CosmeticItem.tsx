import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CosmeticView } from '../../lib/rewards/store';
import { colors, radius, space } from '../../lib/theme';

export default function CosmeticItem({
  cosmetic,
  onClaim,
  onSelect,
}: {
  cosmetic: CosmeticView;
  onClaim: () => void;
  onSelect: () => void;
}) {
  const { name, color, icon, claimState, owned, selected } = cosmetic;
  const locked = claimState === 'locked';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      disabled={locked}
      onPress={owned ? onSelect : onClaim}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        locked && styles.cardLocked,
        pressed && !locked && styles.pressed,
      ]}>
      <View style={[styles.swatch, { backgroundColor: locked ? colors.skeleton : color }]}>
        <Ionicons name={locked ? 'lock-closed' : icon} size={20} color={locked ? colors.muted : '#FFFFFF'} />
      </View>
      <Text style={[styles.name, locked && styles.nameLocked]} numberOfLines={1}>
        {name}
      </Text>
      {selected ? (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={12} color={colors.positive} />
          <Text style={styles.selectedText}>Equipped</Text>
        </View>
      ) : owned ? (
        <Text style={styles.ownedText}>Owned · Tap to equip</Text>
      ) : locked ? (
        <Text style={styles.lockedText}>Locked</Text>
      ) : (
        <Text style={styles.claimText}>Tap to claim</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
  },
  cardSelected: { borderColor: colors.accent, borderWidth: 2 },
  cardLocked: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },
  nameLocked: { color: colors.muted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  selectedText: { fontSize: 9, fontWeight: '700', color: colors.positive },
  ownedText: { fontSize: 9, color: colors.muted, textAlign: 'center' },
  lockedText: { fontSize: 9, color: colors.muted },
  claimText: { fontSize: 9, fontWeight: '700', color: colors.accent },
});
