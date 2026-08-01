import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GhostButton, PrimaryButton } from '../../components/play/Buttons';
import Chip from '../../components/play/Chip';
import GameScreenHeader from '../../components/play/GameScreenHeader';
import ResultModal, { type ResultOutcome } from '../../components/play/ResultModal';
import WagerBar, { isValidWager } from '../../components/play/WagerBar';
import { applyBalanceDelta, canAfford, useBalance } from '../../lib/play/balanceStore';
import { beginRound, endRound } from '../../lib/play/sync';
import { formatMultiplier } from '../../lib/play/format';
import { getGame } from '../../lib/play/games';
import { haptics } from '../../lib/play/haptics';
import { recordRound } from '../../lib/play/historyStore';
import { CHAMBERS_TOTAL, chambersMultiplier, chambersPayout } from '../../lib/play/payouts';
import { colors, radius, space } from '../../lib/theme';

const GAME = getGame('chambers')!;
const MAX_SAFE_BEFORE_AUTO_SETTLE = CHAMBERS_TOTAL - 1; // 5: the last chamber must be the loser

type RoundPhase = 'idle' | 'active' | 'settled';
type ChamberState = 'closed' | 'safe' | 'loss';

type ResultState = {
  outcome: ResultOutcome;
  title: string;
  subtitle: string;
  delta: number;
  balanceAfter: number;
};

export default function ChambersScreen() {
  const router = useRouter();
  const { balance } = useBalance();
  const [wager, setWager] = useState(GAME.minWager * 3);
  const [phase, setPhase] = useState<RoundPhase>('idle');
  const [losingIndex, setLosingIndex] = useState<number | null>(null);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [safeCount, setSafeCount] = useState(0);
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [dismissedAtSafeCount, setDismissedAtSafeCount] = useState<number | null>(null);
  // Synchronous guard against double-settlement: state updates batch/re-render
  // asynchronously, so a rapid double-tap (e.g. chamber + Cash Out) could race
  // past a `settling` state check within the same tick. A ref cannot.
  const settledRef = useRef(false);

  const roundActive = phase === 'active';
  const wagerValid = isValidWager(wager, GAME.minWager, balance) && canAfford(wager);
  const potentialMultiplier = safeCount > 0 ? chambersMultiplier(safeCount) : null;

  function startRound() {
    if (roundActive || !wagerValid) return;
    applyBalanceDelta(-wager);
    // Mirror the stake to the ledger; the local balance above stays authoritative for the UI.
    beginRound('chambers', wager);
    settledRef.current = false;
    setLosingIndex(Math.floor(Math.random() * CHAMBERS_TOTAL));
    setOpened(new Set());
    setSafeCount(0);
    setSettling(false);
    setResult(null);
    setDismissedAtSafeCount(null);
    setPhase('active');
  }

  function settleLoss(index: number) {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettling(true);
    setPhase('settled');
    const balanceAfter = applyBalanceDelta(0);
    endRound({ outcome: 'LOSS', payout: 0 });
    recordRound({
      gameId: 'chambers',
      label: `Hit the live chamber on pick ${opened.size + 1}`,
      wager,
      delta: -wager,
      balanceAfter,
    });
    haptics.lose();
    setResult({
      outcome: 'loss',
      title: 'Chamber was live',
      subtitle: `Chamber ${index + 1} shorted out the sequence`,
      delta: -wager,
      balanceAfter,
    });
  }

  function settleWin(finalSafeCount: number) {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettling(true);
    setPhase('settled');
    const payout = chambersPayout(wager, finalSafeCount);
    const balanceAfter = applyBalanceDelta(payout);
    endRound({ outcome: 'WIN', payout });
    recordRound({
      gameId: 'chambers',
      label: `Cashed out after ${finalSafeCount} safe chamber${finalSafeCount === 1 ? '' : 's'}`,
      wager,
      delta: payout - wager,
      balanceAfter,
    });
    haptics.win();
    setResult({
      outcome: 'win',
      title: finalSafeCount === MAX_SAFE_BEFORE_AUTO_SETTLE ? 'Sequence cleared' : 'Cashed out',
      subtitle: `${formatMultiplier(chambersMultiplier(finalSafeCount))} on ${finalSafeCount} safe chamber${finalSafeCount === 1 ? '' : 's'}`,
      delta: payout - wager,
      balanceAfter,
    });
  }

  function openChamber(index: number) {
    if (!roundActive || settledRef.current || opened.has(index) || losingIndex === null) return;

    const nextOpened = new Set(opened);
    nextOpened.add(index);
    setOpened(nextOpened);

    if (index === losingIndex) {
      settleLoss(index);
      return;
    }

    haptics.tap();
    const nextSafeCount = safeCount + 1;
    setSafeCount(nextSafeCount);

    if (nextSafeCount >= MAX_SAFE_BEFORE_AUTO_SETTLE) {
      // The only unopened chamber left must be the loser — auto-settle the win.
      settleWin(nextSafeCount);
    }
  }

  function cashOut() {
    if (!roundActive || settledRef.current || safeCount === 0) return;
    settleWin(safeCount);
  }

  function playAgain() {
    setResult(null);
    setPhase('idle');
    setLosingIndex(null);
    setOpened(new Set());
    setSafeCount(0);
    setSettling(false);
    setDismissedAtSafeCount(null);
    settledRef.current = false;
  }

  const showChoice =
    roundActive &&
    !settling &&
    safeCount > 0 &&
    safeCount < MAX_SAFE_BEFORE_AUTO_SETTLE &&
    dismissedAtSafeCount !== safeCount;

  return (
    <View style={styles.screen}>
      <GameScreenHeader title={GAME.name} />

      <View style={styles.content}>
        <View style={styles.statusRow}>
          <Chip
            label={roundActive ? `${safeCount} of ${MAX_SAFE_BEFORE_AUTO_SETTLE} safe` : 'Standby'}
            tone="neutral"
            color={GAME.accent}
            backgroundColor={GAME.accentSoft}
          />
          {potentialMultiplier !== null && roundActive ? (
            <Chip label={`Potential ${formatMultiplier(potentialMultiplier)}`} tone="accent" color={GAME.accent} backgroundColor={GAME.accentSoft} />
          ) : null}
        </View>

        <ChamberGrid
          opened={opened}
          losingIndex={losingIndex}
          active={roundActive}
          settling={settling}
          accent={GAME.accent}
          onOpen={openChamber}
        />

        <View style={styles.controls}>
          {!roundActive && (
            <WagerBar
              value={wager}
              onChange={setWager}
              min={GAME.minWager}
              max={balance}
              accent={GAME.accent}
              disabled={roundActive}
            />
          )}

          {!roundActive ? (
            <PrimaryButton
              label="Initialize Sequence"
              onPress={startRound}
              color={GAME.accent}
              disabled={!wagerValid}
            />
          ) : showChoice ? (
            <View style={styles.choiceRow}>
              <GhostButton label="Cash Out" onPress={cashOut} color={GAME.accent} style={styles.choiceFlex} />
              <PrimaryButton
                label="Continue"
                onPress={() => setDismissedAtSafeCount(safeCount)}
                color={GAME.accent}
                style={styles.choiceFlex}
              />
            </View>
          ) : (
            <Text style={styles.hint}>
              {safeCount === 0 ? 'Tap a chamber to begin the sequence.' : 'Tap another chamber to continue.'}
            </Text>
          )}
        </View>
      </View>

      <ResultModal
        visible={result !== null}
        outcome={result?.outcome ?? 'loss'}
        title={result?.title ?? ''}
        subtitle={result?.subtitle}
        delta={result?.delta ?? 0}
        balanceAfter={result?.balanceAfter ?? balance}
        primaryLabel="Play again"
        onPrimary={playAgain}
        secondaryLabel="Lobby"
        onSecondary={() => router.back()}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2x3 grid of glowing energy-core chambers.
// ---------------------------------------------------------------------------

function ChamberGrid({
  opened,
  losingIndex,
  active,
  settling,
  accent,
  onOpen,
}: {
  opened: Set<number>;
  losingIndex: number | null;
  active: boolean;
  settling: boolean;
  accent: string;
  onOpen: (index: number) => void;
}) {
  const indices = useMemo(() => Array.from({ length: CHAMBERS_TOTAL }, (_, i) => i), []);

  return (
    <View style={styles.grid}>
      {indices.map((i) => {
        const isOpened = opened.has(i);
        const state: ChamberState = !isOpened ? 'closed' : i === losingIndex ? 'loss' : 'safe';
        return (
          <Chamber
            key={i}
            index={i}
            state={state}
            accent={accent}
            disabled={!active || settling || isOpened}
            onPress={() => onOpen(i)}
          />
        );
      })}
    </View>
  );
}

function Chamber({
  index,
  state,
  accent,
  disabled,
  onPress,
}: {
  index: number;
  state: ChamberState;
  accent: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const tint =
    state === 'safe' ? colors.positive : state === 'loss' ? colors.negative : accent;
  const bg =
    state === 'safe' ? '#E4F6EE' : state === 'loss' ? '#FBE7EA' : `${accent}14`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chamber ${index + 1}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chamber,
        { borderColor: tint, backgroundColor: bg },
        pressed && !disabled && styles.chamberPressed,
      ]}>
      <View style={[styles.chamberRing, { borderColor: tint }]}>
        {state === 'closed' ? (
          <Ionicons name="hardware-chip-outline" size={26} color={tint} />
        ) : state === 'safe' ? (
          <Ionicons name="checkmark" size={26} color={tint} />
        ) : (
          <Ionicons name="flash" size={26} color={tint} />
        )}
      </View>
      <Text style={[styles.chamberLabel, { color: tint }]}>
        {state === 'closed' ? `0${index + 1}` : state === 'safe' ? 'Safe' : 'Live'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: space.lg, gap: space.xl },
  statusRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    justifyContent: 'space-between',
  },
  chamber: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
  },
  chamberPressed: { opacity: 0.7 },
  chamberRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chamberLabel: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  controls: { gap: space.lg, marginTop: 'auto', paddingBottom: space.xl },
  choiceRow: { flexDirection: 'row', gap: space.sm },
  choiceFlex: { flex: 1 },
  hint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: space.md,
  },
});
