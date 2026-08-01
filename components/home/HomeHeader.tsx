/**
 * Home screen header: greeting on the left, one unified AI Tokens balance
 * pill + neutral avatar (opens the profile sheet) on the right.
 *
 * The greeting reflects the real session: a short loading skeleton while the
 * stored session is being read, "Hi, {name}" once signed in, and a generic
 * "Welcome" (no name) as a guest — signing in only ever happens from the
 * profile sheet, never as a gate in front of the app.
 *
 * Replaces the old header row + separate "AI Credits" card — this is the
 * only balance shown here; the profile sheet (via `ProfileAvatarButton`)
 * has the detailed breakdown.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../lib/auth';
import { useBalance } from '../../lib/play/balanceStore';
import { formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';
import { ProfileAvatarButton } from '../profile/ProfileSheet';

export default function HomeHeader() {
  const { user, isLoading } = useSession();
  const { balance } = useBalance();

  return (
    <View style={styles.headerRow}>
      {isLoading ? (
        <View style={styles.greetingSkeleton} />
      ) : (
        <Text style={styles.greeting} numberOfLines={1}>
          {user ? `Hi, ${user.displayName} 👋` : 'Welcome 👋'}
        </Text>
      )}

      <View style={styles.headerRight}>
        <View style={styles.balancePill}>
          <Ionicons name="hardware-chip" size={13} color={colors.accent} />
          <Text style={styles.balanceText} numberOfLines={1}>
            {formatTokens(balance)}
          </Text>
        </View>
        <ProfileAvatarButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1 },
  greetingSkeleton: {
    width: 140,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.skeleton,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
  },
  balanceText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
