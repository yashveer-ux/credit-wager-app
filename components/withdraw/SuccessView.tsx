import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { GhostButton, PrimaryButton } from '../play/Buttons';
import { formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

/** Post-confirmation receipt: checkmark, reference ID, and a 3-step timeline. */
export default function SuccessView({
  net,
  referenceId,
  methodLabel,
  methodDetail,
  eta,
  onReset,
  onDone,
}: {
  net: number;
  referenceId: string;
  methodLabel: string;
  methodDetail: string;
  eta: string;
  onReset: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.checkCircle}>
        <Ionicons name="checkmark" size={42} color={colors.bg} />
      </View>

      <Text style={styles.title}>Withdrawal requested</Text>
      <Text style={styles.amount}>{formatTokens(net)} tokens</Text>
      <Text style={styles.caption}>Demo withdrawal — no real funds leave this app.</Text>

      <View style={styles.referencePill}>
        <Text style={styles.referenceLabel}>Ref</Text>
        <Text style={styles.referenceValue}>{referenceId}</Text>
      </View>

      <View style={styles.timeline}>
        <TimelineStep title="Requested" subtitle="Just now" done />
        <TimelineStep title="Processing" subtitle={`${methodLabel} ${methodDetail}`} />
        <TimelineStep title="Estimated arrival" subtitle={eta} last />
      </View>

      <View style={styles.buttons}>
        <PrimaryButton label="Make another withdrawal" onPress={onReset} />
        <GhostButton label="Done" onPress={onDone} />
      </View>
    </View>
  );
}

function TimelineStep({
  title,
  subtitle,
  done = false,
  last = false,
}: {
  title: string;
  subtitle: string;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        {done ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.positive} />
        ) : (
          <View style={styles.stepDot} />
        )}
        {!last && <View style={styles.stepConnector} />}
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.stepTitle, !done && styles.stepTitlePending]}>{title}</Text>
        <Text style={styles.stepSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: space.xl, gap: space.sm },
  checkCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.positive,
    marginBottom: space.sm,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  caption: { fontSize: 12, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  referencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    marginTop: space.xs,
  },
  referenceLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  referenceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  timeline: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginTop: space.md,
  },
  step: { flexDirection: 'row', gap: space.md },
  stepRail: { width: 20, alignItems: 'center' },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    marginVertical: 4,
  },
  stepConnector: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: space.lg, gap: 1 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  stepTitlePending: { color: colors.muted },
  stepSubtitle: { fontSize: 12, color: colors.muted },
  buttons: { alignSelf: 'stretch', gap: space.sm, marginTop: space.md },
});
