/**
 * Inline outcome banner for a redemption attempt. One distinct look per
 * state: success (green), invalid/expired/already-used (red), and
 * wrong-provider (blue, since the fix is just switching the selector).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

export type RedeemOutcome =
  | { status: 'success'; tokens: number; providerName: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'already-used' }
  | { status: 'wrong-provider'; expectedProviderName: string };

const SUCCESS_SOFT = '#E4F6EE';
const DANGER_SOFT = '#FBEAE8';

type BannerLook = {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  fg: string;
  title: string;
  message: string;
};

function lookFor(outcome: RedeemOutcome): BannerLook {
  switch (outcome.status) {
    case 'success':
      return {
        icon: 'checkmark-circle',
        bg: SUCCESS_SOFT,
        fg: colors.positive,
        title: `+${formatTokens(outcome.tokens)} AI Tokens from ${outcome.providerName}`,
        message: 'Added to your balance.',
      };
    case 'invalid':
      return {
        icon: 'close-circle',
        bg: DANGER_SOFT,
        fg: colors.negative,
        title: 'Code not recognized',
        message: 'Double-check the code and try again.',
      };
    case 'expired':
      return {
        icon: 'time',
        bg: DANGER_SOFT,
        fg: colors.negative,
        title: 'Code expired',
        message: 'This promo code is past its expiry date.',
      };
    case 'already-used':
      return {
        icon: 'checkmark-done-circle',
        bg: DANGER_SOFT,
        fg: colors.negative,
        title: 'Code already redeemed',
        message: 'Each promo code can only be used once.',
      };
    case 'wrong-provider':
      return {
        icon: 'swap-horizontal',
        bg: colors.accentSoft,
        fg: colors.accent,
        title: 'Wrong provider selected',
        message: `This code is for ${outcome.expectedProviderName}. Select ${outcome.expectedProviderName} and try again.`,
      };
  }
}

export default function ResultBanner({ outcome }: { outcome: RedeemOutcome }) {
  const look = lookFor(outcome);
  return (
    <View
      style={[styles.banner, { backgroundColor: look.bg }]}
      accessibilityRole="alert"
      accessibilityLabel={`${look.title}. ${look.message}`}>
      <Ionicons name={look.icon} size={22} color={look.fg} />
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: look.fg }]}>{look.title}</Text>
        <Text style={styles.message}>{look.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderRadius: radius.md,
    padding: space.lg,
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700' },
  message: { fontSize: 12.5, color: colors.muted, lineHeight: 17 },
});
