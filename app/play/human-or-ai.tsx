import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GhostButton, PrimaryButton } from '../../components/play/Buttons';
import Chip from '../../components/play/Chip';
import GameScreenHeader from '../../components/play/GameScreenHeader';
import ResultModal, { type ResultOutcome } from '../../components/play/ResultModal';
import WagerBar, { isValidWager } from '../../components/play/WagerBar';

import { applyBalanceDelta, canAfford, useBalance } from '../../lib/play/balanceStore';
import { beginRound, endRound } from '../../lib/play/sync';
import { type TuringBetItem, TURING_BET_CONTENT } from '../../lib/play/content';
import { getGame } from '../../lib/play/games';
import { formatMultiplier, formatTokens } from '../../lib/play/format';
import { haptics } from '../../lib/play/haptics';
import { recordRound } from '../../lib/play/historyStore';
import { turingBetMultiplier, turingBetPayout } from '../../lib/play/payouts';
import { colors, radius, space } from '../../lib/theme';

const game = getGame('human-or-ai')!;
const TOTAL_ROUNDS = 10;

/** Fisher-Yates shuffle — never mutates the source array. */
function shuffle<T>(source: T[]): T[] {
  const items = [...source];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

type Phase = 'setup' | 'playing';

type Reveal = {
  correct: boolean;
  isAI: boolean;
  explanation: string;
};

type ModalState = {
  outcome: ResultOutcome;
  title: string;
  subtitle?: string;
  delta: number;
  balanceAfter: number;
};

export default function HumanOrAiScreen() {
  const router = useRouter();
  const { balance } = useBalance();

  const [phase, setPhase] = useState<Phase>('setup');
  const [wager, setWager] = useState(game.minWager);
  const [queue, setQueue] = useState<TuringBetItem[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  // Refs (not state) so a rapid double-tap is blocked synchronously, before
  // React has a chance to re-render with the disabling state applied.
  const answeredRef = useRef(false);
  const settledRef = useRef(false);

  const currentItem: TuringBetItem | undefined = queue[roundIndex];
  const wagerValid = canAfford(wager) && isValidWager(wager, game.minWager, balance);

  function startRun() {
    if (!wagerValid) return;
    applyBalanceDelta(-wager);
    // Mirror the stake to the ledger; the local balance above stays authoritative for the UI.
    beginRound('human-or-ai', wager);
    settledRef.current = false;
    answeredRef.current = false;
    setQueue(shuffle(TURING_BET_CONTENT).slice(0, TOTAL_ROUNDS));
    setRoundIndex(0);
    setCorrectCount(0);
    setAnswered(false);
    setReveal(null);
    setPhase('playing');
  }

  /** Settles the run exactly once: applies payout, records history, fires haptics. */
  function settleRun(finalCorrectCount: number): { payout: number; balanceAfter: number } | null {
    if (settledRef.current) return null;
    settledRef.current = true;
    const payout = turingBetPayout(wager, finalCorrectCount);
    const balanceAfter = applyBalanceDelta(payout);
    endRound({ outcome: payout > 0 ? 'WIN' : 'LOSS', payout });
    recordRound({
      gameId: 'human-or-ai',
      label:
        finalCorrectCount > 0
          ? `Turing Bet · ${finalCorrectCount}/${TOTAL_ROUNDS} correct`
          : 'Turing Bet · wrong answer',
      wager,
      delta: payout - wager,
      balanceAfter,
    });
    if (payout > wager) haptics.win();
    else if (payout === 0) haptics.lose();
    return { payout, balanceAfter };
  }

  function handleAnswer(choseAI: boolean) {
    if (answeredRef.current || !currentItem) return;
    answeredRef.current = true;
    setAnswered(true);
    haptics.select();

    const correct = choseAI === currentItem.isAI;
    setReveal({ correct, isAI: currentItem.isAI, explanation: currentItem.explanation });

    if (correct) {
      const nextCorrect = correctCount + 1;
      setCorrectCount(nextCorrect);
      if (nextCorrect === TOTAL_ROUNDS) {
        const settled = settleRun(nextCorrect);
        if (settled) {
          setModal({
            outcome: 'win',
            title: 'Perfect run!',
            subtitle: `You cleared all ${TOTAL_ROUNDS} rounds.`,
            delta: settled.payout - wager,
            balanceAfter: settled.balanceAfter,
          });
        }
      }
    } else {
      const settled = settleRun(0);
      if (settled) {
        setModal({
          outcome: 'loss',
          title: 'Wrong call',
          subtitle: currentItem.explanation,
          delta: settled.payout - wager,
          balanceAfter: settled.balanceAfter,
        });
      }
    }
  }

  function cashOut() {
    if (correctCount <= 0) return;
    const settled = settleRun(correctCount);
    if (settled) {
      setModal({
        outcome: 'win',
        title: 'Cashed out',
        subtitle: `${correctCount}/${TOTAL_ROUNDS} correct`,
        delta: settled.payout - wager,
        balanceAfter: settled.balanceAfter,
      });
    }
  }

  function nextRound() {
    answeredRef.current = false;
    setRoundIndex((i) => i + 1);
    setAnswered(false);
    setReveal(null);
  }

  function resetToSetup() {
    setModal(null);
    setPhase('setup');
    setQueue([]);
    setRoundIndex(0);
    setCorrectCount(0);
    answeredRef.current = false;
    setAnswered(false);
    setReveal(null);
  }

  const bankedMultiplier = turingBetMultiplier(correctCount);
  const nextMultiplier = turingBetMultiplier(correctCount + 1);
  const showContinueOptions = answered && reveal?.correct && correctCount < TOTAL_ROUNDS;

  return (
    <View style={styles.screen}>
      <GameScreenHeader title="Turing Bet" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {phase === 'setup' && (
          <>
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>Human or AI?</Text>
              <Text style={styles.introBody}>
                Read each passage and decide whether it was written by a human or generated by
                an AI. Every correct answer climbs the multiplier ladder — cash out whenever you
                like, but a single wrong answer ends the run and forfeits your wager.
              </Text>
            </View>
            <WagerBar
              value={wager}
              onChange={setWager}
              min={game.minWager}
              max={balance}
              accent={game.accent}
            />
            <PrimaryButton
              label="Start"
              onPress={startRun}
              disabled={!wagerValid}
              color={game.accent}
            />
          </>
        )}

        {phase === 'playing' && currentItem && (
          <>
            <LadderStrip correctCount={correctCount} />

            <View style={styles.roundHeaderRow}>
              <Chip label={currentItem.category} tone="neutral" />
              <Text style={styles.roundCounter}>
                Round {roundIndex + 1} / {queue.length}
              </Text>
            </View>

            <View style={styles.textCard}>
              <Text style={styles.textBody}>{currentItem.text}</Text>
            </View>

            {!answered && (
              <View style={styles.buttonRow}>
                <GhostButton
                  label="Human"
                  onPress={() => handleAnswer(false)}
                  color={game.accent}
                  style={styles.buttonFlex}
                />
                <PrimaryButton
                  label="AI"
                  onPress={() => handleAnswer(true)}
                  color={game.accent}
                  style={styles.buttonFlex}
                />
              </View>
            )}

            {answered && reveal && (
              <View
                style={[
                  styles.revealBanner,
                  { backgroundColor: reveal.correct ? '#E4F6EE' : '#FBE7EA' },
                ]}>
                <Text
                  style={[
                    styles.revealTitle,
                    { color: reveal.correct ? colors.positive : colors.negative },
                  ]}>
                  {reveal.correct ? 'Correct' : 'Incorrect'}
                </Text>
                <Text style={styles.revealBody}>
                  This was written by {reveal.isAI ? 'an AI' : 'a human'}.
                </Text>
                <Text style={styles.revealExplanation}>{reveal.explanation}</Text>
              </View>
            )}

            {showContinueOptions && (
              <>
                {bankedMultiplier !== null && (
                  <Text style={styles.multiplierHint}>
                    Cash out now at {formatMultiplier(bankedMultiplier)} for{' '}
                    {formatTokens(turingBetPayout(wager, correctCount))}
                    {nextMultiplier !== null
                      ? ` · next correct answer reaches ${formatMultiplier(nextMultiplier)}`
                      : ''}
                  </Text>
                )}
                <View style={styles.buttonRow}>
                  <GhostButton
                    label="Cash Out"
                    onPress={cashOut}
                    color={game.accent}
                    style={styles.buttonFlex}
                  />
                  <PrimaryButton
                    label="Next Round"
                    onPress={nextRound}
                    color={game.accent}
                    style={styles.buttonFlex}
                  />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {modal && (
        <ResultModal
          visible
          outcome={modal.outcome}
          title={modal.title}
          subtitle={modal.subtitle}
          delta={modal.delta}
          balanceAfter={modal.balanceAfter}
          primaryLabel="Play again"
          onPrimary={resetToSetup}
          secondaryLabel="Lobby"
          onSecondary={() => router.back()}
        />
      )}
    </View>
  );
}

function LadderStrip({ correctCount }: { correctCount: number }) {
  return (
    <View style={styles.ladderRow}>
      {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.ladderSegment,
            i < correctCount && { backgroundColor: game.accent },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },

  introCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.sm,
  },
  introTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  introBody: { fontSize: 14, lineHeight: 21, color: colors.muted },

  ladderRow: { flexDirection: 'row', gap: space.xs },
  ladderSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.skeleton,
  },

  roundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundCounter: { fontSize: 12, fontWeight: '600', color: colors.muted },

  textCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    minHeight: 140,
    justifyContent: 'center',
  },
  textBody: { fontSize: 17, lineHeight: 27, color: colors.text },

  buttonRow: { flexDirection: 'row', gap: space.md },
  buttonFlex: { flex: 1 },

  revealBanner: {
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs + 2,
  },
  revealTitle: { fontSize: 15, fontWeight: '800' },
  revealBody: { fontSize: 14, fontWeight: '600', color: colors.text },
  revealExplanation: { fontSize: 13, lineHeight: 19, color: colors.muted },

  multiplierHint: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
