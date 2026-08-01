import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Chip from '../../components/play/Chip';
import GameScreenHeader from '../../components/play/GameScreenHeader';
import { PrimaryButton } from '../../components/play/Buttons';
import ResultModal, { type ResultOutcome } from '../../components/play/ResultModal';
import WagerBar, { isValidWager } from '../../components/play/WagerBar';
import { applyBalanceDelta, canAfford, useBalance } from '../../lib/play/balanceStore';
import { getGame } from '../../lib/play/games';
import { haptics } from '../../lib/play/haptics';
import { recordRound } from '../../lib/play/historyStore';
import { roulettePayout, type RouletteBetType } from '../../lib/play/payouts';
import { WHEEL_ORDER, colorOf, resolveBet, spin, type RouletteBet } from '../../lib/play/rouletteEngine';
import { colors, radius, space } from '../../lib/theme';

const GAME = getGame('roulette')!;

/** Module-scope wrapper so the impure random draw isn't attributed to component render. */
function pickExtraSpins(): number {
  return 6 + Math.floor(Math.random() * 3);
}

const WHEEL_SIZE = 260;
const WHEEL_RADIUS = WHEEL_SIZE / 2 - 18;
const POCKET_SIZE = 22;
const ANGLE_STEP = 360 / WHEEL_ORDER.length;
const SPIN_DURATION = 3200;

const NUMBERS = Array.from({ length: 37 }, (_, n) => n);

const OUTSIDE_BETS: { type: RouletteBetType; label: string }[] = [
  { type: 'red', label: 'Red' },
  { type: 'black', label: 'Black' },
  { type: 'odd', label: 'Odd' },
  { type: 'even', label: 'Even' },
  { type: 'low', label: '1-18' },
  { type: 'high', label: '19-36' },
  { type: 'dozen1', label: '1st 12' },
  { type: 'dozen2', label: '2nd 12' },
  { type: 'dozen3', label: '3rd 12' },
];

type Phase = 'betting' | 'spinning' | 'settled';

type ResultState = {
  visible: boolean;
  outcome: ResultOutcome;
  title: string;
  subtitle: string;
  delta: number;
  balanceAfter: number;
};

function pocketColor(n: number): string {
  const c = colorOf(n);
  if (c === 'red') return colors.negative;
  if (c === 'black') return colors.text;
  return colors.positive;
}

function betLabel(bet: RouletteBet): string {
  switch (bet.type) {
    case 'straight':
      return `Straight ${bet.value}`;
    case 'red':
      return 'Red';
    case 'black':
      return 'Black';
    case 'odd':
      return 'Odd';
    case 'even':
      return 'Even';
    case 'low':
      return '1-18';
    case 'high':
      return '19-36';
    case 'dozen1':
      return '1st dozen';
    case 'dozen2':
      return '2nd dozen';
    case 'dozen3':
      return '3rd dozen';
  }
}

export default function RouletteScreen() {
  const { balance } = useBalance();

  const [wager, setWager] = useState(GAME.minWager);
  const [bet, setBet] = useState<RouletteBet | null>(null);
  const [phase, setPhase] = useState<Phase>('betting');
  const [isBusy, setIsBusy] = useState(false);
  const [spinResult, setSpinResult] = useState<number | null>(null);
  const [result, setResult] = useState<ResultState>({
    visible: false,
    outcome: 'win',
    title: '',
    subtitle: '',
    delta: 0,
    balanceAfter: 0,
  });

  const [rotationAnim] = useState(() => new Animated.Value(0));
  const rotationRef = useRef(0);
  const settledRef = useRef(false);

  const pockets = useMemo(
    () =>
      WHEEL_ORDER.map((n, i) => {
        const angleDeg = -90 + i * ANGLE_STEP;
        const angleRad = (angleDeg * Math.PI) / 180;
        const left = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.cos(angleRad) - POCKET_SIZE / 2;
        const top = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.sin(angleRad) - POCKET_SIZE / 2;
        return { n, left, top };
      }),
    []
  );

  const roundActive = phase !== 'betting';

  async function onSpin() {
    if (isBusy || !bet || phase !== 'betting') return;
    if (!isValidWager(wager, GAME.minWager, balance) || !canAfford(wager)) return;

    haptics.tap();
    settledRef.current = false;
    setIsBusy(true);
    setSpinResult(null);
    setPhase('spinning');
    applyBalanceDelta(-wager);
    const effectiveWager = wager;

    const outcome = spin();
    const targetIndex = WHEEL_ORDER.indexOf(outcome);
    const targetAngle = targetIndex * ANGLE_STEP;
    const desiredMod = ((-targetAngle % 360) + 360) % 360;
    const currentMod = ((rotationRef.current % 360) + 360) % 360;
    let deltaToAlign = desiredMod - currentMod;
    if (deltaToAlign <= 0) deltaToAlign += 360;
    const extraSpins = pickExtraSpins();
    const newRotation = rotationRef.current + extraSpins * 360 + deltaToAlign;
    rotationRef.current = newRotation;

    await new Promise<void>((resolve) => {
      Animated.timing(rotationAnim, {
        toValue: newRotation,
        duration: SPIN_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => resolve());
    });

    await settleSpin(bet, outcome, effectiveWager);
  }

  async function settleSpin(activeBet: RouletteBet, outcome: number, effectiveWager: number) {
    if (settledRef.current) return;
    settledRef.current = true;

    setSpinResult(outcome);
    const won = resolveBet(activeBet, outcome);
    const payout = roulettePayout(effectiveWager, activeBet.type, won);
    const balanceAfter = applyBalanceDelta(payout);

    recordRound({
      gameId: 'roulette',
      label: `${betLabel(activeBet)} · ${won ? 'win' : 'loss'}`,
      wager: effectiveWager,
      delta: payout - effectiveWager,
      balanceAfter,
    });

    if (payout > effectiveWager) haptics.win();
    else if (payout === 0) haptics.lose();

    setPhase('settled');
    setIsBusy(false);
    setResult({
      visible: true,
      outcome: won ? 'win' : 'loss',
      title: won ? 'You win!' : 'No luck this time',
      subtitle: `The ball landed on ${outcome} (${colorOf(outcome)}).`,
      delta: payout - effectiveWager,
      balanceAfter,
    });
  }

  function onPlayAgain() {
    setResult((s) => ({ ...s, visible: false }));
    setBet(null);
    setSpinResult(null);
    setPhase('betting');
    setWager((w) => Math.max(0, Math.min(w, balance)));
  }

  const rotate = rotationAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.screen}>
      <GameScreenHeader title="Roulette" />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.rulesBlurb}>
          Single-zero European wheel · Straight numbers pay 36× · Choose one bet, then spin
        </Text>

        <View style={[styles.wheelCard, { borderColor: GAME.accent }]}>
          <View style={styles.pointerWrap}>
            <Ionicons name="caret-down" size={22} color={GAME.accent} />
          </View>
          <Animated.View
            style={[
              styles.wheel,
              { width: WHEEL_SIZE, height: WHEEL_SIZE, borderRadius: WHEEL_SIZE / 2 },
              { transform: [{ rotate }] },
            ]}>
            {pockets.map((p) => (
              <View
                key={p.n}
                style={[
                  styles.pocket,
                  { left: p.left, top: p.top, backgroundColor: pocketColor(p.n) },
                ]}>
                <Text style={styles.pocketLabel}>{p.n}</Text>
              </View>
            ))}
            <View style={styles.wheelHub}>
              <Ionicons name="hardware-chip" size={18} color={GAME.accent} />
            </View>
          </Animated.View>

          {spinResult !== null && phase === 'settled' ? (
            <View style={styles.resultRow}>
              <View style={[styles.resultDot, { backgroundColor: pocketColor(spinResult) }]} />
              <Text style={styles.resultText}>Result: {spinResult}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.boardSection}>
          <Text style={styles.boardLabel}>Straight numbers</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.numberRow}>
            {NUMBERS.map((n) => {
              const selected = bet?.type === 'straight' && bet.value === n;
              return (
                <Pressable
                  key={n}
                  disabled={roundActive}
                  onPress={() => {
                    haptics.select();
                    setBet({ type: 'straight', value: n });
                  }}
                  style={[
                    styles.numberChip,
                    { backgroundColor: pocketColor(n) },
                    selected && { borderColor: GAME.accent },
                    roundActive && styles.disabled,
                  ]}>
                  <Text style={styles.numberChipLabel}>{n}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.boardLabel}>Outside bets</Text>
          <View style={styles.outsideRow}>
            {OUTSIDE_BETS.map((item) => {
              const selected = bet?.type === item.type;
              return (
                <Pressable
                  key={item.type}
                  disabled={roundActive}
                  onPress={() => {
                    haptics.select();
                    setBet({ type: item.type });
                  }}
                  style={[
                    styles.outsideChip,
                    selected && { borderColor: GAME.accent, backgroundColor: GAME.accentSoft },
                    roundActive && styles.disabled,
                  ]}>
                  <Text style={[styles.outsideChipLabel, selected && { color: GAME.accent }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {bet ? (
            <Chip
              label={`Bet: ${betLabel(bet)}`}
              color={GAME.accent}
              backgroundColor={GAME.accentSoft}
            />
          ) : null}
        </View>

        <WagerBar
          value={wager}
          onChange={setWager}
          min={GAME.minWager}
          max={balance}
          accent={GAME.accent}
          disabled={roundActive}
        />

        <PrimaryButton
          label="Spin"
          color={GAME.accent}
          disabled={
            isBusy || !bet || phase !== 'betting' || !isValidWager(wager, GAME.minWager, balance) || !canAfford(wager)
          }
          onPress={onSpin}
        />
      </ScrollView>

      <ResultModal
        visible={result.visible}
        outcome={result.outcome}
        title={result.title}
        subtitle={result.subtitle}
        delta={result.delta}
        balanceAfter={result.balanceAfter}
        primaryLabel="Play again"
        onPrimary={onPlayAgain}
        secondaryLabel="Lobby"
        onSecondary={() => setResult((s) => ({ ...s, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },

  rulesBlurb: { fontSize: 11, color: colors.muted, textAlign: 'center' },

  wheelCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: space.xl,
    gap: space.sm,
  },
  pointerWrap: { marginBottom: -6, zIndex: 2 },
  wheel: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocket: {
    position: 'absolute',
    width: POCKET_SIZE,
    height: POCKET_SIZE,
    borderRadius: POCKET_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocketLabel: { fontSize: 8, fontWeight: '700', color: '#FFFFFF' },
  wheelHub: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  resultDot: { width: 10, height: 10, borderRadius: 5 },
  resultText: { fontSize: 13, fontWeight: '700', color: colors.text },

  boardSection: { gap: space.sm },
  boardLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  numberRow: { gap: space.xs + 2, paddingVertical: space.xs },
  numberChip: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  numberChipLabel: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  outsideRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  outsideChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  outsideChipLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  disabled: { opacity: 0.4 },
});
