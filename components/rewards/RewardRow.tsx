import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { ClaimState, IconName } from '../../lib/rewards/types';
import { colors, radius, space } from '../../lib/theme';
import ClaimButton from './ClaimButton';
import ProgressBar from './ProgressBar';

/**
 * Shared row for Daily missions, Weekly challenges, and Milestones.
 *
 * Layout is three columns: icon | flexible middle (title/description/
 * progress bar/reward) | fixed-min-width right column stacking the
 * button/chip above the progress fraction. The right column is a real
 * flex sibling — nothing overlaps at any width; long titles wrap and
 * the row simply grows taller.
 */
export default function RewardRow({
  icon,
  title,
  description,
  progress,
  target,
  rewardTokens,
  claimState,
  onClaim,
}: {
  icon: IconName;
  title: string;
  description?: string;
  progress: number;
  target: number;
  rewardTokens: number;
  claimState: ClaimState;
  onClaim: () => void;
}) {
  const dimmed = claimState === 'locked';
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, dimmed && styles.iconWrapDimmed]}>
        <Ionicons name={icon} size={18} color={dimmed ? colors.muted : colors.accent} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, dimmed && styles.titleDimmed]} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <View style={styles.progressTrack}>
          <ProgressBar
            progress={target > 0 ? progress / target : 0}
            color={dimmed ? colors.muted : colors.accent}
          />
        </View>
        <Text style={[styles.reward, dimmed && styles.rewardDimmed]}>
          +{rewardTokens} AI Tokens
        </Text>
      </View>
      <View style={styles.right}>
        <ClaimButton state={claimState} onPress={onClaim} />
        <Text style={styles.fraction}>
          {Math.min(progress, target)}/{target}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  iconWrapDimmed: { backgroundColor: colors.skeleton },
  // minWidth: 0 lets long titles shrink/wrap instead of pushing the right column.
  main: { flex: 1, flexShrink: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  titleDimmed: { color: colors.muted },
  description: { fontSize: 11, color: colors.muted, lineHeight: 14 },
  progressTrack: { marginTop: 2, alignSelf: 'stretch' },
  reward: { fontSize: 11, fontWeight: '700', color: colors.positive, marginTop: 2 },
  rewardDimmed: { color: colors.muted },
  // Fixed min width keeps buttons/chips aligned across every row & section.
  right: { minWidth: 92, alignItems: 'flex-end', gap: space.xs },
  fraction: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
});
