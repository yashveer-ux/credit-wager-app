import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, PrimaryButton } from '../../../components/play/Buttons';
import Chip from '../../../components/play/Chip';
import WagerBar, { isValidWager } from '../../../components/play/WagerBar';
import { useSession } from '../../../lib/auth';
import {
  getTokenBalance,
  leaveTable,
  useBlackjackTable,
  type OnlineCard,
  type SeatView,
} from '../../../lib/online/blackjack';
import { formatTokens } from '../../../lib/play/format';
import { colors, radius, space } from '../../../lib/theme';

const ACCENT = colors.accent;

const RESULT_CHIP: Record<string, { label: string; tone: 'positive' | 'negative' | 'neutral' }> = {
  win: { label: 'Win', tone: 'positive' },
  blackjack: { label: 'Blackjack', tone: 'positive' },
  loss: { label: 'Loss', tone: 'negative' },
  push: { label: 'Push', tone: 'neutral' },
};

function suitGlyph(suit: string): string {
  const s = suit?.toLowerCase() ?? '';
  if (s.startsWith('h') || suit === '♥') return '♥';
  if (s.startsWith('d') || suit === '♦') return '♦';
  if (s.startsWith('c') || suit === '♣') return '♣';
  if (s.startsWith('s') || suit === '♠') return '♠';
  return suit;
}

const isRedSuit = (suit: string) => {
  const g = suitGlyph(suit);
  return g === '♥' || g === '♦';
};

/** Seconds until an ISO deadline, re-rendered twice a second. Null without one. */
function useCountdown(deadline: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
}

export default function OnlineTableScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tableId = typeof id === 'string' ? id : '';

  const { user } = useSession();
  const { state, error, loading, connection, inFlight, refresh, sendAction } =
    useBlackjackTable(tableId);

  const [wager, setWager] = useState(10);
  const [balance, setBalance] = useState<number | null>(null);

  // Server wallet only — the local demo balance has no authority online.
  useEffect(() => {
    void getTokenBalance().then(setBalance, () => setBalance(null));
  }, [state?.roundId, state?.status]);

  const mySeat = state?.seats.find((s) => s.player?.id === user?.id) ?? null;
  const others = (state?.seats ?? []).filter((s) => s !== mySeat);
  const isMyTurn =
    state?.status === 'playing' && mySeat != null && state.activeSeat === mySeat.index;
  const turnSeconds = useCountdown(state?.status === 'playing' ? state?.turnDeadline : null);
  const nextRoundSeconds = useCountdown(state?.status === 'settled' ? state?.nextRoundAt : null);

  const connected = connection === 'open';
  const minBet = state?.minBet ?? 10;
  const maxBet = Math.min(state?.maxBet ?? Number.MAX_SAFE_INTEGER, balance ?? 0);
  const myBetPlaced = mySeat?.bet != null && mySeat.bet > 0;
  const canDouble =
    isMyTurn &&
    (mySeat?.cards?.length ?? 0) === 2 &&
    balance !== null &&
    (mySeat?.bet ?? 0) <= balance;
  // Every control gate in one place: turn, legality, in-flight, connection.
  const actionsDisabled = !connected || inFlight || !isMyTurn;

  function confirmLeave() {
    Alert.alert('Leave table?', 'Your seat is given up. A bet already placed stays in the round.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          // Best effort: navigation must not hang on a dead connection.
          leaveTable(tableId).catch(() => {});
          router.back();
        },
      },
    ]);
  }

  const activeName =
    state?.status === 'playing' && state.activeSeat != null
      ? (state.seats.find((s) => s.index === state.activeSeat)?.player?.displayName ?? null)
      : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.headerRow, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave table"
          onPress={confirmLeave}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Online Blackjack
        </Text>
        {connected ? (
          <View style={styles.balancePill}>
            <Ionicons name="hardware-chip" size={13} color={ACCENT} />
            <Text style={styles.balanceText}>
              {balance === null ? '—' : formatTokens(balance)}
            </Text>
          </View>
        ) : (
          <Chip label={connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'} tone="warning" />
        )}
      </View>

      {!connected && state ? (
        <View style={styles.reconnectBanner}>
          <ActivityIndicator size="small" color="#B7791F" />
          <Text style={styles.reconnectText}>
            Connection lost — reconnecting. The table continues on the server.
          </Text>
        </View>
      ) : null}

      {loading && !state ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : !state ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error ?? 'This table could not be loaded.'}</Text>
          <GhostButton label="Retry" color={ACCENT} onPress={() => void refresh()} />
          <GhostButton label="Back to lobby" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {state.code ? (
            <Text style={styles.roomCode}>
              Room code: <Text style={styles.roomCodeValue}>{state.code}</Text>
            </Text>
          ) : null}

          <View style={styles.table}>
            <StatusChip
              status={state.status}
              isMyTurn={!!isMyTurn}
              activeName={activeName}
              turnSeconds={turnSeconds}
              nextRoundSeconds={nextRoundSeconds}
            />

            <View style={styles.dealerBlock}>
              <View style={styles.handHeaderRow}>
                <Text style={styles.handLabel}>Dealer</Text>
                <Text style={styles.handTotal}>{state.dealer.total ?? '—'}</Text>
              </View>
              <CardRow cards={state.dealer.cards} holeHidden={state.dealer.holeHidden} />
            </View>

            {others.length > 0 ? (
              <>
                <View style={styles.tableDividerLine} />
                <View style={styles.seatsRow}>
                  {others.map((seat) => (
                    <SeatCard
                      key={seat.index}
                      seat={seat}
                      active={state.status === 'playing' && state.activeSeat === seat.index}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.tableDividerLine} />

            <View style={[styles.myBlock, isMyTurn && styles.myBlockActive]}>
              <View style={styles.handHeaderRow}>
                <View style={styles.myNameRow}>
                  <Text style={styles.handLabel}>You</Text>
                  {mySeat?.ready ? <Chip label="Ready" tone="positive" /> : null}
                  {mySeat?.result && RESULT_CHIP[mySeat.result] ? (
                    <Chip
                      label={RESULT_CHIP[mySeat.result].label}
                      tone={RESULT_CHIP[mySeat.result].tone}
                    />
                  ) : null}
                </View>
                <Text style={[styles.handTotal, { color: ACCENT }]}>{mySeat?.total ?? '—'}</Text>
              </View>
              {myBetPlaced ? (
                <Text style={styles.betLine}>Bet {formatTokens(mySeat!.bet!)}</Text>
              ) : null}
              <CardRow cards={mySeat?.cards ?? []} />
              {!mySeat ? (
                <Text style={styles.spectatorHint}>
                  You are watching this table. Join from the lobby to play.
                </Text>
              ) : null}
            </View>
          </View>

          {/* ---- controls, by phase; the server is the referee for all of them ---- */}

          {mySeat && state.status === 'waiting' ? (
            <PrimaryButton
              label={mySeat.ready ? 'Waiting for players…' : 'Ready up'}
              disabled={!connected || inFlight || !!mySeat.ready}
              onPress={() => void sendAction('ready')}
            />
          ) : null}

          {mySeat && state.status === 'betting' ? (
            myBetPlaced ? (
              <Text style={styles.waitHint}>Bet placed. Waiting for the other players…</Text>
            ) : (
              <>
                <WagerBar
                  value={wager}
                  onChange={setWager}
                  min={minBet}
                  max={maxBet}
                  accent={ACCENT}
                  disabled={!connected || inFlight}
                />
                <PrimaryButton
                  label="Place bet"
                  disabled={!connected || inFlight || !isValidWager(wager, minBet, maxBet)}
                  onPress={() => void sendAction('bet', { amount: wager })}
                />
              </>
            )
          ) : null}

          {mySeat && state.status === 'playing' ? (
            <View style={styles.actionsRow}>
              <GhostButton
                label="Hit"
                color={ACCENT}
                disabled={actionsDisabled}
                onPress={() => void sendAction('hit')}
                style={styles.actionFlex}
              />
              {canDouble ? (
                <GhostButton
                  label="Double"
                  color={ACCENT}
                  disabled={actionsDisabled}
                  onPress={() => void sendAction('double')}
                  style={styles.actionFlex}
                />
              ) : null}
              <PrimaryButton
                label="Stand"
                disabled={actionsDisabled}
                onPress={() => void sendAction('stand')}
                style={styles.actionFlex}
              />
            </View>
          ) : null}

          {state.status === 'settled' ? (
            <Text style={styles.waitHint}>
              {nextRoundSeconds != null
                ? `Next round in ${nextRoundSeconds}s`
                : 'Round over. Waiting for the next round…'}
            </Text>
          ) : null}

          <GhostButton label="Leave table" onPress={confirmLeave} />
        </ScrollView>
      )}
    </View>
  );
}

function StatusChip({
  status,
  isMyTurn,
  activeName,
  turnSeconds,
  nextRoundSeconds,
}: {
  status: string;
  isMyTurn: boolean;
  activeName: string | null;
  turnSeconds: number | null;
  nextRoundSeconds: number | null;
}) {
  let label: string;
  switch (status) {
    case 'waiting':
      label = 'Waiting for players';
      break;
    case 'betting':
      label = 'Place your bets';
      break;
    case 'playing': {
      const who = isMyTurn ? 'Your move' : activeName ? `${activeName}'s move` : 'In play';
      label = turnSeconds != null ? `${who} · ${turnSeconds}s` : who;
      break;
    }
    case 'settled':
      label = nextRoundSeconds != null ? `Next round in ${nextRoundSeconds}s` : 'Round over';
      break;
    default:
      label = status;
  }
  return <Chip label={label} color={ACCENT} backgroundColor={colors.accentSoft} />;
}

function SeatCard({ seat, active }: { seat: SeatView; active: boolean }) {
  if (!seat.player) {
    return (
      <View style={[styles.seatCard, styles.seatEmpty]}>
        <Text style={styles.seatEmptyText}>Open seat</Text>
      </View>
    );
  }
  const result = seat.result ? RESULT_CHIP[seat.result] : null;
  return (
    <View style={[styles.seatCard, active && styles.seatActive]}>
      <View style={styles.seatTopRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {seat.player.avatarEmoji ?? seat.player.displayName?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={[styles.readyDot, seat.ready && styles.readyDotOn]} />
      </View>
      <Text style={styles.seatName} numberOfLines={1}>
        {seat.player.displayName}
      </Text>
      <Text style={styles.seatMeta}>
        {seat.bet != null && seat.bet > 0 ? `Bet ${formatTokens(seat.bet)}` : '—'}
      </Text>
      <CardRow cards={seat.cards ?? []} small />
      <View style={styles.seatFooter}>
        <Text style={styles.seatTotal}>{seat.total ?? ''}</Text>
        {result ? <Chip label={result.label} tone={result.tone} /> : null}
      </View>
    </View>
  );
}

function CardRow({
  cards,
  holeHidden,
  small,
}: {
  cards: OnlineCard[];
  holeHidden?: boolean;
  small?: boolean;
}) {
  if (cards.length === 0) {
    return (
      <View style={[styles.emptySlot, small && styles.cardSmall]}>
        <Ionicons name="hardware-chip-outline" size={small ? 12 : 18} color={colors.border} />
      </View>
    );
  }
  return (
    <View style={styles.cardRow}>
      {cards.map((card, i) => {
        const hidden =
          card.hidden || card.rank == null || card.rank === '?' ||
          (!!holeHidden && i === cards.length - 1);
        return (
          <View key={i} style={[styles.card, small && styles.cardSmall]}>
            {hidden ? (
              <Ionicons name="hardware-chip-outline" size={small ? 12 : 18} color={colors.border} />
            ) : (
              <>
                <Text
                  style={[
                    styles.cardRank,
                    small && styles.cardRankSmall,
                    { color: isRedSuit(card.suit) ? colors.negative : colors.text },
                  ]}>
                  {card.rank}
                </Text>
                <Text
                  style={[
                    styles.cardSuit,
                    small && styles.cardSuitSmall,
                    { color: isRedSuit(card.suit) ? colors.negative : colors.text },
                  ]}>
                  {suitGlyph(card.suit)}
                </Text>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.xxl },

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

  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    backgroundColor: '#FDF1DC',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  reconnectText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#B7791F' },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 },

  roomCode: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  roomCodeValue: { fontWeight: '800', color: colors.text, letterSpacing: 1 },

  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ACCENT,
    padding: space.lg,
    gap: space.md,
  },
  tableDividerLine: { height: 1, backgroundColor: colors.border },

  dealerBlock: { gap: space.sm },
  handHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  handLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  handTotal: { fontSize: 18, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },

  seatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  seatCard: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    gap: 4,
  },
  seatActive: { borderColor: ACCENT, backgroundColor: colors.accentSoft },
  seatEmpty: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', minHeight: 90 },
  seatEmptyText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  seatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  readyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  readyDotOn: { backgroundColor: colors.positive },
  seatName: { fontSize: 12, fontWeight: '700', color: colors.text },
  seatMeta: { fontSize: 11, color: colors.muted, fontVariant: ['tabular-nums'] },
  seatFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seatTotal: { fontSize: 13, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },

  myBlock: { gap: space.sm, borderRadius: radius.sm, padding: space.sm, margin: -space.sm },
  myBlockActive: { backgroundColor: colors.accentSoft },
  myNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  betLine: { fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  spectatorHint: { fontSize: 12, color: colors.muted },

  cardRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: {
    width: 48,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSmall: { width: 28, height: 38 },
  cardRank: { fontSize: 16, fontWeight: '800' },
  cardRankSmall: { fontSize: 11 },
  cardSuit: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  cardSuitSmall: { fontSize: 9, marginTop: 0 },
  emptySlot: {
    width: 48,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  waitHint: { fontSize: 13, color: colors.muted, textAlign: 'center', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: space.sm },
  actionFlex: { flex: 1 },
});
