import { useRouter } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../../components/play/Buttons';
import GameScreenHeader from '../../components/play/GameScreenHeader';
import ResultModal, { type ResultOutcome } from '../../components/play/ResultModal';
import WagerBar, { isValidWager } from '../../components/play/WagerBar';
import { applyBalanceDelta, canAfford, useBalance } from '../../lib/play/balanceStore';
import { crashIntensity, displayedMultiplierAtElapsed } from '../../lib/play/crashCurve';
import { formatMultiplier, formatSignedTokens, formatTokens } from '../../lib/play/format';
import { getGame } from '../../lib/play/games';
import { haptics } from '../../lib/play/haptics';
import { recordRound } from '../../lib/play/historyStore';
import { crashPayout, generateCrashMultiplier } from '../../lib/play/payouts';
import { colors, space } from '../../lib/theme';

const GAME = getGame('crash')!;
const TICK_MS = 50;
const SATELLITE_COUNT = 6;
const VISUAL_SIZE = 260;
const ORBIT_RADIUS = 88;

/** Module-scope wrapper so the impure clock read isn't attributed to component render. */
function nowMs(): number {
  return Date.now();
}

type RoundPhase = 'idle' | 'running' | 'crashed' | 'cashed';

type ResultState = {
  outcome: ResultOutcome;
  title: string;
  subtitle: string;
  delta: number;
  wager: number;
  balanceAfter: number;
};

export default function CrashScreen() {
  const router = useRouter();
  const { balance } = useBalance();
  const [wager, setWager] = useState(Math.min(GAME.minWager * 2, 5000));
  const [phase, setPhase] = useState<RoundPhase>('idle');
  const [frame, setFrame] = useState({ displayed: 1, elapsed: 0 });
  const [result, setResult] = useState<ResultState | null>(null);

  const crashPointRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const settledRef = useRef(false);
  const displayedRef = useRef(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const roundActive = phase === 'running';
  const wagerValid = isValidWager(wager, GAME.minWager, balance) && canAfford(wager);

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startRound() {
    if (roundActive || !wagerValid) return;
    applyBalanceDelta(-wager);
    settledRef.current = false;
    crashPointRef.current = generateCrashMultiplier();
    startTimeRef.current = nowMs();
    displayedRef.current = 1;
    setFrame({ displayed: 1, elapsed: 0 });
    setResult(null);
    setPhase('running');

    intervalRef.current = setInterval(() => {
      const crashPoint = crashPointRef.current;
      if (crashPoint === null) return;
      const elapsed = (nowMs() - startTimeRef.current) / 1000;
      const displayed = displayedMultiplierAtElapsed(elapsed, crashPoint);
      displayedRef.current = displayed;
      setFrame({ displayed, elapsed });
      if (displayed >= crashPoint) {
        settleCrash(crashPoint);
      }
    }, TICK_MS);
  }

  function settleCrash(crashPoint: number) {
    if (settledRef.current) return;
    settledRef.current = true;
    stopTimer();
    setPhase('crashed');
    const balanceAfter = applyBalanceDelta(0);
    recordRound({
      gameId: 'crash',
      label: `Crashed at ${formatMultiplier(crashPoint)}`,
      wager,
      delta: -wager,
      balanceAfter,
    });
    haptics.lose();
    setResult({
      outcome: 'loss',
      title: 'System crashed',
      subtitle: `Overloaded at ${formatMultiplier(crashPoint)}`,
      delta: -wager,
      wager,
      balanceAfter,
    });
  }

  function cashOut() {
    if (settledRef.current || phase !== 'running') return;
    settledRef.current = true;
    stopTimer();
    const locked = displayedRef.current;
    setFrame((f) => ({ ...f, displayed: locked }));
    setPhase('cashed');
    const payout = crashPayout(wager, locked);
    const balanceAfter = applyBalanceDelta(payout);
    recordRound({
      gameId: 'crash',
      label: `Cashed out at ${formatMultiplier(locked)}`,
      wager,
      delta: payout - wager,
      balanceAfter,
    });
    haptics.win();
    setResult({
      outcome: 'win',
      title: 'Ejected safely',
      subtitle: `Locked in at ${formatMultiplier(locked)}`,
      delta: payout - wager,
      wager,
      balanceAfter,
    });
  }

  function playAgain() {
    setResult(null);
    setPhase('idle');
    crashPointRef.current = null;
    displayedRef.current = 1;
    setFrame({ displayed: 1, elapsed: 0 });
  }

  return (
    <View style={styles.screen}>
      <GameScreenHeader title={GAME.name} />

      <View style={styles.content}>
        <NeuralVisual
          displayed={frame.displayed}
          elapsed={frame.elapsed}
          phase={phase}
          accent={GAME.accent}
          wager={wager}
        />

        <View style={styles.controls}>
          <WagerBar
            value={wager}
            onChange={setWager}
            min={GAME.minWager}
            max={balance}
            accent={GAME.accent}
            disabled={roundActive}
          />

          {roundActive ? (
            <PrimaryButton label="Cash Out" onPress={cashOut} color={colors.positive} />
          ) : (
            <PrimaryButton
              label="Initialize"
              onPress={startRound}
              color={GAME.accent}
              disabled={!wagerValid}
            />
          )}
        </View>
      </View>

      <ResultModal
        visible={result !== null}
        outcome={result?.outcome ?? 'loss'}
        title={result?.title ?? ''}
        subtitle={result?.subtitle}
        delta={result?.delta ?? 0}
        wager={result?.wager}
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
// "Unstable neural network" visual: a pulsing core node with satellite nodes
// connected by thin lines. Pulse speed, line flicker, and color all shift
// from calm violet toward red as the displayed multiplier climbs.
// ---------------------------------------------------------------------------

function NeuralVisual({
  displayed,
  elapsed,
  phase,
  accent,
  wager,
}: {
  displayed: number;
  elapsed: number;
  phase: RoundPhase;
  accent: string;
  wager: number;
}) {
  const crashed = phase === 'crashed';
  const intensity = phase === 'idle' ? 0 : crashIntensity(displayed);
  const glowColor = mixColor(accent, colors.negative, intensity);
  const center = VISUAL_SIZE / 2;

  const angles = useMemo(
    () =>
      Array.from({ length: SATELLITE_COUNT }, (_, i) => (Math.PI * 2 * i) / SATELLITE_COUNT + Math.PI / 8),
    []
  );

  const [flashOpacity] = useState(() => new Animated.Value(0));
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (phase === 'crashed' && prevPhaseRef.current !== 'crashed') {
      flashOpacity.setValue(0.6);
      Animated.timing(flashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }
    prevPhaseRef.current = phase;
  }, [phase, flashOpacity]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.readoutWrap} pointerEvents="none">
        <Text style={[styles.readout, { color: crashed ? colors.negative : glowColor }]}>
          {formatMultiplier(displayed)}
        </Text>
        {crashed ? <Text style={styles.crashedLabel}>SYSTEM CRASHED</Text> : null}
        {phase === 'running' ? (
          <Text style={styles.potentialLabel}>
            Cash out now for {formatTokens(crashPayout(wager, displayed))}
          </Text>
        ) : phase === 'crashed' ? (
          <Text style={[styles.potentialLabel, { color: colors.negative }]}>
            Wager lost: {formatSignedTokens(-wager)}
          </Text>
        ) : phase === 'cashed' ? (
          <Text style={[styles.potentialLabel, { color: colors.positive }]}>
            Locked payout: {formatTokens(crashPayout(wager, displayed))}
          </Text>
        ) : null}
      </View>

      <View style={[styles.visual, { width: VISUAL_SIZE, height: VISUAL_SIZE }]}>
        {angles.map((angle, i) => {
          const wobble = crashed ? 0 : Math.sin(elapsed * (2.5 + intensity * 9) + i * 1.9) * (4 + intensity * 10);
          const radius = ORBIT_RADIUS + wobble;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const dist = Math.hypot(x - center, y - center);
          const lineAngle = (Math.atan2(y - center, x - center) * 180) / Math.PI;
          const flicker = crashed
            ? 0.12
            : 0.3 + 0.55 * Math.abs(Math.sin(elapsed * (3 + intensity * 10) + i * 2.3));
          const satSize = 16 - intensity * 3;

          return (
            <Fragment key={i}>
              <View
                style={[
                  styles.line,
                  {
                    left: center,
                    top: center,
                    width: dist,
                    backgroundColor: glowColor,
                    opacity: flicker,
                    transform: [{ rotate: `${lineAngle}deg` }],
                  },
                ]}
              />
              <View
                style={[
                  styles.satellite,
                  {
                    left: x - satSize / 2,
                    top: y - satSize / 2,
                    width: satSize,
                    height: satSize,
                    borderRadius: satSize / 2,
                    backgroundColor: glowColor,
                    opacity: crashed ? 0.3 : 0.55 + intensity * 0.45,
                  },
                ]}
              />
            </Fragment>
          );
        })}

        <View
          style={[
            styles.core,
            {
              backgroundColor: glowColor,
              transform: [
                {
                  scale: crashed
                    ? 1.25
                    : 1 + Math.sin(elapsed * (3 + intensity * 10)) * (0.05 + intensity * 0.06),
                },
              ],
            },
          ]}
        />

        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />
      </View>
    </View>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(from: string, to: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    paddingHorizontal: space.lg,
    justifyContent: 'space-between',
    paddingBottom: space.xl,
  },
  visualWrap: { alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  visual: { alignItems: 'center', justifyContent: 'center' },
  core: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    left: VISUAL_SIZE / 2 - 30,
    top: VISUAL_SIZE / 2 - 30,
  },
  satellite: { position: 'absolute' },
  line: {
    position: 'absolute',
    height: 1.5,
    borderRadius: 1,
    transformOrigin: '0% 50%',
  },
  flash: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: VISUAL_SIZE,
    height: VISUAL_SIZE,
    borderRadius: VISUAL_SIZE / 2,
    backgroundColor: colors.negative,
  },
  readoutWrap: { alignItems: 'center', marginBottom: space.lg },
  readout: { fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  crashedLabel: {
    marginTop: space.xs,
    fontSize: 13,
    fontWeight: '800',
    color: colors.negative,
    letterSpacing: 1.5,
  },
  potentialLabel: {
    marginTop: space.xs,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  controls: { gap: space.lg },
});
