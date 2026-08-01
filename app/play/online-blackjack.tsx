import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, PrimaryButton } from '../../components/play/Buttons';
import Chip from '../../components/play/Chip';
import { formatTokens } from '../../lib/play/format';
import {
  createTable,
  describeError,
  getTokenBalance,
  joinTable,
  listTables,
  quickMatch,
  type TableSummary,
} from '../../lib/online/blackjack';
import { colors, radius, space } from '../../lib/theme';

const ACCENT = colors.accent;

export default function OnlineBlackjackLobby() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Which action is in flight ('quick', 'public', 'private', 'code', or a table id). */
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    // The wallet is cosmetic here; a failed balance must not block the lobby.
    void getTokenBalance().then(setBalance, () => setBalance(null));
    try {
      setTables(await listTables());
      setListError(null);
    } catch (e) {
      setListError(describeError(e));
    }
  }, []);

  useEffect(() => {
    // Initial fetch; every setState inside runs after the response lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function run(key: string, fn: () => Promise<string>) {
    if (busy) return;
    setBusy(key);
    setActionError(null);
    try {
      const tableId = await fn();
      if (!tableId) throw new Error('NO_TABLE');
      router.push(`/play/table/${tableId}` as never);
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.headerRow, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Online Blackjack
        </Text>
        <View style={styles.balancePill}>
          <Ionicons name="hardware-chip" size={13} color={ACCENT} />
          <Text style={styles.balanceText}>{balance === null ? '—' : formatTokens(balance)}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: space.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.blurb}>
          Live tables against real players. Bets and payouts settle on the server wallet.
        </Text>

        <PrimaryButton
          label={busy === 'quick' ? 'Finding a table…' : 'Quick match'}
          disabled={busy !== null}
          onPress={() => void run('quick', quickMatch)}
        />

        <View style={styles.row}>
          <GhostButton
            label="Create public"
            color={ACCENT}
            disabled={busy !== null}
            onPress={() => void run('public', async () => (await createTable('public')).id)}
            style={styles.flex}
          />
          <GhostButton
            label="Create private"
            color={ACCENT}
            disabled={busy !== null}
            onPress={() => void run('private', async () => (await createTable('private')).id)}
            style={styles.flex}
          />
        </View>

        <View style={styles.codeRow}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Room code"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.codeInput}
          />
          <GhostButton
            label={busy === 'code' ? 'Joining…' : 'Join'}
            color={ACCENT}
            disabled={busy !== null || code.trim().length === 0}
            onPress={() => void run('code', () => joinTable(code.trim()))}
          />
        </View>

        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PUBLIC TABLES</Text>

          {tables === null && !listError ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : listError ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>{listError}</Text>
              <GhostButton label="Retry" color={ACCENT} onPress={() => void load()} />
            </View>
          ) : tables && tables.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>
                No open tables right now. Start one, or use quick match.
              </Text>
            </View>
          ) : (
            <View style={styles.tableCard}>
              {tables?.map((t, i) => (
                <View key={t.id} style={[styles.tableRow, i > 0 && styles.tableDivider]}>
                  <View style={styles.tableInfo}>
                    <Text style={styles.tableName} numberOfLines={1}>
                      {t.name ?? `Table ${t.id.slice(0, 6).toUpperCase()}`}
                    </Text>
                    <Text style={styles.tableMeta}>
                      {t.players ?? 0}
                      {t.maxPlayers ? `/${t.maxPlayers}` : ''} players
                      {t.minBet ? ` · Min ${formatTokens(t.minBet)}` : ''}
                    </Text>
                  </View>
                  {t.status && t.status !== 'waiting' ? (
                    <Chip label="In round" tone="warning" />
                  ) : null}
                  <GhostButton
                    label={busy === t.id ? '…' : 'Join'}
                    color={ACCENT}
                    disabled={busy !== null}
                    onPress={() => void run(t.id, () => joinTable(t.id))}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.lg },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.bg,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
  },
  balanceText: { fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

  blurb: { fontSize: 12, color: colors.muted, textAlign: 'center' },

  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },

  codeRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 1,
  },

  error: { fontSize: 12, color: colors.negative, fontWeight: '600', textAlign: 'center' },

  section: { gap: space.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },

  centerBox: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 },

  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md + 2,
  },
  tableDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  tableInfo: { flex: 1 },
  tableName: { fontSize: 14, fontWeight: '600', color: colors.text },
  tableMeta: { marginTop: 2, fontSize: 12, color: colors.muted },
});
