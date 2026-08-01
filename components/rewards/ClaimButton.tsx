import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { ClaimState } from '../../lib/rewards/types';
import { colors, radius, space } from '../../lib/theme';

/**
 * Shared claim/status button used by missions, weekly challenges, and
 * milestones. Renders one of the 4 required visual states.
 */
export default function ClaimButton({
  state,
  onPress,
  claimLabel = 'Claim',
}: {
  state: ClaimState;
  onPress: () => void;
  claimLabel?: string;
}) {
  if (state === 'claimed') {
    return (
      <Pressable disabled style={[styles.base, styles.claimed]}>
        <Ionicons name="checkmark-circle" size={14} color={colors.muted} />
        <Text style={styles.claimedText}>Claimed</Text>
      </Pressable>
    );
  }

  if (state === 'locked') {
    return (
      <Pressable disabled style={[styles.base, styles.locked]}>
        <Ionicons name="lock-closed" size={13} color={colors.muted} />
        <Text style={styles.lockedText}>Locked</Text>
      </Pressable>
    );
  }

  if (state === 'in-progress') {
    return (
      <Pressable disabled style={[styles.base, styles.inProgress]}>
        <Text style={styles.inProgressText}>In progress</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={claimLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles.claimable, pressed && styles.pressed]}>
      <Text style={styles.claimableText}>{claimLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
    borderRadius: radius.sm,
    minWidth: 84,
  },
  pressed: { opacity: 0.7 },

  claimable: { backgroundColor: colors.accent },
  claimableText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  claimed: { backgroundColor: 'transparent' },
  claimedText: { fontSize: 12, fontWeight: '600', color: colors.muted },

  locked: { backgroundColor: 'transparent' },
  lockedText: { fontSize: 12, fontWeight: '600', color: colors.muted },

  inProgress: { backgroundColor: colors.skeleton },
  inProgressText: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
