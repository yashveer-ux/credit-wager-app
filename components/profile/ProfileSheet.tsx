/**
 * Profile avatar button + bottom-sheet popup.
 *
 * Shows the real unified "AI Tokens" balance (via `useBalance`) and real
 * per-round stats/history (via `usePlayHistory`) — everything else (username,
 * level) is mock decoration since there is no auth/user system in scope.
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

import { applyBalanceDelta, useBalance } from '../../lib/play/balanceStore';
import { formatSignedTokens, formatTokens } from '../../lib/play/format';
import { usePlayHistory } from '../../lib/play/historyStore';
import { colors, radius, space } from '../../lib/theme';

const MOCK_USERNAME = 'Yash';
const MOCK_LEVEL = 'Level 4';
const DEMO_WITHDRAWAL_AMOUNT = 100;
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
  const { balance } = useBalance();
  const history = usePlayHistory();

  const stats = useMemo(() => {
    const played = history.length;
    const wins = history.filter((h) => h.delta > 0).length;
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
    const totalWagered = history.reduce((sum, h) => sum + h.wager, 0);
    const totalWon = history.reduce((sum, h) => sum + (h.delta > 0 ? h.delta : 0), 0);
    return { played, wins, winRate, totalWagered, totalWon };
  }, [history]);

  const recentHistory = history.slice(0, RECENT_HISTORY_LIMIT);

  const handleWithdraw = () => {
    const amount = Math.min(DEMO_WITHDRAWAL_AMOUNT, balance);
    if (amount <= 0) {
      Alert.alert('Demo Withdrawal', 'This is a fictional demo — there are no funds to withdraw.');
      return;
    }
    applyBalanceDelta(-amount);
    Alert.alert(
      'Demo Withdrawal',
      `This is a fictional demo — no real funds are transferred. ${formatTokens(amount)} AI Tokens were deducted from your demo balance.`
    );
  };

  const handleHistory = () => {
    onClose();
    router.push('/history' as any);
  };

  const handleRewards = () => {
    onClose();
    router.push('/rewards' as any);
  };

  const handleSettings = () => Alert.alert('Settings', 'Coming soon');
  const handleHelp = () => Alert.alert('Help', 'Coming soon');

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onClose },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Profile</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close profile"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            <View style={styles.identityRow}>
              <View style={styles.avatarLarge}>
                <Ionicons name="person" size={30} color={colors.muted} />
              </View>
              <View>
                <Text style={styles.username}>{MOCK_USERNAME}</Text>
                <Text style={styles.level}>{MOCK_LEVEL}</Text>
              </View>
            </View>

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
              accessibilityLabel="Demo withdrawal"
              onPress={handleWithdraw}
              style={({ pressed }) => [styles.withdrawButton, pressed && styles.pressed]}>
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.withdrawButtonText}>Demo Withdrawal</Text>
            </Pressable>
            <Text style={styles.withdrawDisclaimer}>
              Fictional demo only — no real money is ever moved.
            </Text>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent activity</Text>
              </View>
              {recentHistory.length === 0 ? (
                <Text style={styles.emptyText}>No games played yet.</Text>
              ) : (
                recentHistory.map((entry) => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View style={styles.historyMain}>
                      <Text style={styles.historyLabel} numberOfLines={1}>
                        {entry.label}
                      </Text>
                      <Text style={styles.historyWager}>Wager {formatTokens(entry.wager)}</Text>
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
              <MenuRow
                icon="log-out-outline"
                label="Sign out"
                onPress={handleSignOut}
                destructive
              />
            </View>
          </ScrollView>
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
    maxHeight: '88%',
  },
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
  username: { fontSize: 18, fontWeight: '700', color: colors.text },
  level: { fontSize: 13, color: colors.muted, marginTop: 2 },

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
  withdrawButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
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
