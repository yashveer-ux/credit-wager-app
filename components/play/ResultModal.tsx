import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { formatSignedTokens, formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';
import { GhostButton, PrimaryButton } from './Buttons';

export type ResultOutcome = 'win' | 'loss' | 'push';

const OUTCOME_STYLE: Record<ResultOutcome, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  win: { icon: 'trophy', color: colors.positive },
  loss: { icon: 'close-circle', color: colors.negative },
  push: { icon: 'remove-circle', color: colors.muted },
};

export default function ResultModal({
  visible,
  outcome,
  title,
  subtitle,
  delta,
  wager,
  balanceAfter,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  visible: boolean;
  outcome: ResultOutcome;
  title: string;
  subtitle?: string;
  delta: number;
  /** Optional: the round's effective total wager, shown under the delta. */
  wager?: number;
  balanceAfter: number;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const { icon, color } = OUTCOME_STYLE[outcome];
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: `${color}1A` }]}>
            <Ionicons name={icon} size={30} color={color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text style={[styles.delta, { color }]}>{formatSignedTokens(delta)}</Text>
          <Text style={styles.balance}>
            {typeof wager === 'number' ? `Wager ${formatTokens(wager)} · ` : ''}New balance:{' '}
            {formatTokens(balanceAfter)}
          </Text>

          <View style={styles.actions}>
            {secondaryLabel && onSecondary ? (
              <GhostButton label={secondaryLabel} onPress={onSecondary} style={styles.actionFlex} />
            ) : null}
            <PrimaryButton label={primaryLabel} onPress={onPrimary} style={styles.actionFlex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,17,22,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    gap: space.xs + 2,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 2 },
  delta: { fontSize: 28, fontWeight: '800', marginTop: space.sm, fontVariant: ['tabular-nums'] },
  balance: { fontSize: 12, color: colors.muted, marginBottom: space.md },
  actions: { flexDirection: 'row', gap: space.sm, width: '100%', marginTop: space.sm },
  actionFlex: { flex: 1 },
});
