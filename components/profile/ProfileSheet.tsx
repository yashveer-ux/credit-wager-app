/**
 * Profile avatar button + bottom-sheet popup.
 *
 * This is the ONLY place sign-in lives — the app never gates you behind a
 * login screen; you land as a guest and everything (games, rewards, convert)
 * already works locally. Signing in here just attaches a real account on top
 * (server-synced history, real sign-out) via `useSession()`.
 *
 * Shows the real unified "AI Tokens" balance (via `useBalance`) and real
 * per-round stats/history (via `usePlayHistory`).
 *
 * `ProfileAvatarButton` is fully self-contained: it renders the neutral grey
 * avatar circle and owns its own open/close state, so a parent only needs to
 * render `<ProfileAvatarButton />` to get the whole feature working.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatRelativeTime } from '../../lib/format';
import { useSession } from '../../lib/auth';
import { useUnifiedHistory } from '../../lib/ledger/ledgerStore';
import { useBalance } from '../../lib/play/balanceStore';
import { formatSignedTokens, formatTokens } from '../../lib/play/format';
import { usePlayHistory } from '../../lib/play/historyStore';
import { colors, radius, space } from '../../lib/theme';
import HistoryPanel, { KIND_LABEL } from './HistoryPanel';

const RECENT_HISTORY_LIMIT = 5;

export function ProfileAvatarButton() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
        <Ionicons name="person" size={19} color={colors.muted} />
      </Pressable>
      <ProfileSheet visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useSession();
  const { balance } = useBalance();
  const history = usePlayHistory();
  const unifiedHistory = useUnifiedHistory();

  // 'history' switches the sheet into a full-height in-sheet history view —
  // it never navigates away, so the bottom tab bar is never involved.
  const [view, setView] = useState<'profile' | 'history'>('profile');

  // Every close path goes through here so the sheet reopens on the profile view.
  const handleClose = () => {
    setView('profile');
    onClose();
  };

  const stats = useMemo(() => {
    const played = history.length;
    const wins = history.filter((h) => h.delta > 0).length;
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
    const totalWagered = history.reduce((sum, h) => sum + h.wager, 0);
    const totalWon = history.reduce((sum, h) => sum + (h.delta > 0 ? h.delta : 0), 0);
    return { played, wins, winRate, totalWagered, totalWon };
  }, [history]);

  const recentHistory = unifiedHistory.slice(0, RECENT_HISTORY_LIMIT);

  const handleWithdraw = () => {
    handleClose();
    router.push('/withdraw' as any);
  };

  const handleHistory = () => setView('history');

  const handleRewards = () => {
    handleClose();
    router.push('/rewards' as any);
  };

  const handleSettings = () => Alert.alert('Settings', 'Coming soon');
  const handleHelp = () => Alert.alert('Help', 'Coming soon');

  const handleLogin = () => {
    handleClose();
    router.push('/login' as any);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut();
          handleClose();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.sheet,
            // Fixed height in history mode so the inner list can fill + scroll.
            view === 'history' ? styles.sheetTall : styles.sheetCapped,
            { paddingBottom: insets.bottom + space.lg },
          ]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeaderRow}>
            <View style={styles.sheetTitleGroup}>
              {view === 'history' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to profile"
                  hitSlop={8}
                  onPress={() => setView('profile')}
                  style={styles.backButton}>
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </Pressable>
              ) : null}
              <Text style={styles.sheetTitle}>{view === 'history' ? 'History' : 'Profile'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close profile"
              hitSlop={8}
              onPress={handleClose}
              style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {view === 'history' ? (
            <HistoryPanel />
          ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            <View style={styles.identityRow}>
              <View style={styles.avatarLarge}>
                <Ionicons name="person" size={30} color={colors.muted} />
              </View>
              <View style={styles.identityText}>
                <Text style={styles.username}>{user ? user.displayName : 'Guest'}</Text>
                <Text style={styles.level} numberOfLines={1}>
                  {user ? user.email : 'Playing without an account'}
                </Text>
              </View>
            </View>

            {!user && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log in or create an account"
                onPress={handleLogin}
                style={({ pressed }) => [styles.loginCallout, pressed && styles.pressed]}>
                <View style={styles.loginCalloutText}>
                  <Text style={styles.loginCalloutTitle}>Log in or create an account</Text>
                  <Text style={styles.loginCalloutBody}>
                    Sync your progress across devices — you can keep playing as a guest either way.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
              </Pressable>
            )}

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Unified balance</Text>
              <Text style={styles.balanceValue}>{formatTokens(balance)}</Text>
              <Text style={styles.balanceSub}>AI Tokens</Text>
            </View>

            <View style={styles.statsRow}>
              <StatBox label="Games played" value={String(stats.played)} />
              <StatBox label="Wins" value={String(stats.wins)} />
              <StatBox label="Win rate" value={`${stats.winRate}%`} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Balance details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total wagered</Text>
                <Text style={styles.detailValue}>{formatTokens(stats.totalWagered)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total won</Text>
                <Text style={styles.detailValue}>{formatTokens(stats.totalWon)}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Withdraw"
              onPress={handleWithdraw}
              style={({ pressed }) => [styles.withdrawButton, pressed && styles.pressed]}>
              <Ionicons name="cash-outline" size={18} color={colors.onAccent} />
              <Text style={styles.withdrawButtonText}>Withdraw</Text>
            </Pressable>
            <Text style={styles.withdrawDisclaimer}>
              Fictional demo only — no real money is ever moved.
            </Text>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent activity</Text>
              </View>
              {recentHistory.length === 0 ? (
                <Text style={styles.emptyText}>No activity yet.</Text>
              ) : (
                recentHistory.map((entry) => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View style={styles.historyMain}>
                      <Text style={styles.historyLabel} numberOfLines={1}>
                        {entry.label}
                      </Text>
                      <Text style={styles.historyWager}>
                        {(entry.provider ?? KIND_LABEL[entry.kind]) +
                          ' · ' +
                          formatRelativeTime(entry.createdAt)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.historyDelta,
                        { color: entry.delta >= 0 ? colors.positive : colors.negative },
                      ]}>
                      {formatSignedTokens(entry.delta)}
                    </Text>
                  </View>
                ))
              )}
              <MenuRow icon="time" label="View full history" onPress={handleHistory} />
            </View>

            <View style={styles.section}>
              <MenuRow icon="gift" label="Rewards" onPress={handleRewards} />
              <MenuRow icon="settings-outline" label="Settings" onPress={handleSettings} />
              <MenuRow icon="help-circle-outline" label="Help" onPress={handleHelp} />
              {user ? (
                <MenuRow
                  icon="log-out-outline"
                  label="Sign out"
                  onPress={handleSignOut}
                  destructive
                />
              ) : (
                <MenuRow icon="log-in-outline" label="Log in" onPress={handleLogin} />
              )}
            </View>
          </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <Ionicons
        name={icon}
        size={18}
        color={destructive ? colors.negative : colors.muted}
        style={styles.menuIcon}
      />
      <Text style={[styles.menuLabel, destructive && { color: colors.negative }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.skeleton,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },

  backdrop: { flex: 1, backgroundColor: 'rgba(14,17,22,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  sheetCapped: { maxHeight: '85%' },
  sheetTall: { height: '85%' },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  sheetTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.sm,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },

  scrollContent: { paddingBottom: space.lg, gap: space.lg },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.skeleton,
    borderWidth: 1,
    borderColor: colors.border,
  },
  identityText: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: colors.text },
  level: { fontSize: 13, color: colors.muted, marginTop: 2 },

  loginCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: space.md,
  },
  loginCalloutText: { flex: 1 },
  loginCalloutTitle: { fontSize: 14, fontWeight: '700', color: colors.onAccent },
  loginCalloutBody: {
    fontSize: 12,
    color: 'rgba(25,18,4,0.75)',
    marginTop: 2,
    lineHeight: 16,
  },

  balanceCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: space.lg,
    alignItems: 'center',
  },
  balanceLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  balanceValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  balanceSub: { fontSize: 12, color: colors.accent, fontWeight: '600', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: space.sm },
  statBox: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: colors.muted, textAlign: 'center' },

  section: { gap: space.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  withdrawButtonText: { fontSize: 15, fontWeight: '700', color: colors.onAccent },
  withdrawDisclaimer: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: -space.sm },

  emptyText: { fontSize: 13, color: colors.muted, paddingVertical: space.sm },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  historyMain: { flex: 1 },
  historyLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  historyWager: { fontSize: 11, color: colors.muted, marginTop: 1 },
  historyDelta: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: { width: 20 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
});
