import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { CheckInDayView } from '../../lib/rewards/store';
import { colors } from '../../lib/theme';
import Card from './Card';
import ClaimButton from './ClaimButton';
import SectionHeader from './SectionHeader';

export default function CheckInStrip({
  days,
  todayClaimed,
  onClaim,
}: {
  days: CheckInDayView[];
  todayClaimed: boolean;
  onClaim: () => void;
}) {
  const claimableToday = days.find((d) => d.state === 'today');

  return (
    <Card>
      <SectionHeader title="Daily check-in" subtitle="Come back every day for AI Tokens" />
      <View style={styles.row}>
        {days.map((d) => (
          <View key={d.day} style={styles.dayCol}>
            <View
              style={[
                styles.dayCircle,
                d.state === 'claimed' && styles.dayClaimed,
                d.state === 'today' && styles.dayToday,
                d.state === 'locked' && styles.dayLocked,
              ]}>
              {d.state === 'claimed' ? (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              ) : d.state === 'locked' ? (
                <Ionicons name="lock-closed" size={13} color={colors.muted} />
              ) : (
                <Ionicons name="gift" size={16} color={colors.accent} />
              )}
            </View>
            <Text style={styles.dayLabel}>{d.label}</Text>
            <Text style={styles.dayReward}>+{d.rewardTokens}</Text>
          </View>
        ))}
      </View>
      {claimableToday ? (
        <ClaimButton
          state={todayClaimed ? 'claimed' : 'claimable'}
          onPress={onClaim}
          claimLabel={`Claim +${claimableToday.rewardTokens} tokens`}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 4, width: 40 },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayClaimed: { backgroundColor: colors.positive, borderColor: colors.positive },
  dayToday: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2 },
  dayLocked: { backgroundColor: colors.skeleton, borderColor: colors.border },
  dayLabel: { fontSize: 10, fontWeight: '600', color: colors.muted },
  dayReward: { fontSize: 9, fontWeight: '700', color: colors.muted },
});
