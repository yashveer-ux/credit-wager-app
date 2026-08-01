import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import Chip from '../../components/play/Chip';
import GameScreenHeader from '../../components/play/GameScreenHeader';
import { GhostButton, PrimaryButton } from '../../components/play/Buttons';
import ResultModal, { type ResultOutcome } from '../../components/play/ResultModal';
import WagerBar, { isValidWager } from '../../components/play/WagerBar';
import { applyBalanceDelta, canAfford, useBalance } from '../../lib/play/balanceStore';
import {
  RED_SUITS,
  SUIT_SYMBOL,
  createShoe,
  dealerShouldHit,
  handValue,
  isBlackjack,
  isBust,
  resolveHands,
  type BlackjackResult,
  type Card,
} from '../../lib/play/blackjackEngine';
import { getGame } from '../../lib/play/games';
import { haptics } from '../../lib/play/haptics';
import { recordRound } from '../../lib/play/historyStore';
import { blackjackPayout, type BlackjackOutcome } from '../../lib/play/payouts';
import { colors, radius, space } from '../../lib/theme';

const GAME = getGame('blackjack')!;

type Phase = 'betting' | 'dealing' | 'player-turn' | 'dealer-turn' | 'settled';

type ResultState = {
  visible: boolean;
  outcome: ResultOutcome;
  title: string;
  subtitle: string;
  delta: number;
  balanceAfter: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function outcomeForResult(result: BlackjackResult): ResultOutcome {
  if (result === 'push') return 'push';
  if (result === 'player-blackjack' || result === 'win') return 'win';
  return 'loss';
}

function payoutOutcomeForResult(result: BlackjackResult): BlackjackOutcome {
  switch (result) {
    case 'player-blackjack':
      return 'blackjack';
    case 'dealer-blackjack':
      return 'loss';
    case 'push':
      return 'push';
    case 'win':
      return 'win';
    case 'loss':
      return 'loss';
  }
}

function describeResult(
  result: BlackjackResult,
  playerCards: Card[],
  dealerCards: Card[]
): { title: string; subtitle: string; label: string } {
  const playerBust = isBust(playerCards);
  const dealerBust = isBust(dealerCards);
  switch (result) {
    case 'player-blackjack':
      return { title: 'Blackjack!', subtitle: 'Natural 21 pays 2.5× your wager.', label: 'Blackjack' };
    case 'dealer-blackjack':
      return { title: 'Dealer blackjack', subtitle: 'The dealer drew a natural 21.', label: 'Dealer blackjack' };
    case 'push':
      return { title: 'Push', subtitle: 'Your wager is returned.', label: 'Push' };
    case 'win':
      return {
        title: 'You win',
        subtitle: dealerBust ? 'The dealer busted.' : 'Your total beat the dealer.',
        label: 'Win',
      };
    case 'loss':
      return {
        title: playerBust ? 'Bust' : 'You lose',
        subtitle: playerBust ? 'You went over 21.' : 'The dealer had the better hand.',
        label: playerBust ? 'Bust' : 'Loss',
      };
  }
}

const PHASE_CHIP: Partial<Record<Phase, string>> = {
  betting: 'Place your wager',
  dealing: 'Dealing…',
  'player-turn': 'Your move',
  'dealer-turn': "Dealer's turn",
};

export default function BlackjackScreen() {
  const { balance } = useBalance();

  const [wager, setWager] = useState(GAME.minWager);
  const [phase, setPhase] = useState<Phase>('betting');
  const [isBusy, setIsBusy] = useState(false);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [dealerHoleHidden, setDealerHoleHidden] = useState(true);
  const [result, setResult] = useState<ResultState>({
    visible: false,
    outcome: 'win',
    title: '',
    subtitle: '',
    delta: 0,
    balanceAfter: 0,
  });

  const shoeRef = useRef<Card[]>(createShoe());
  const effectiveWagerRef = useRef(wager);
  const settledRef = useRef(false);

  function drawCard(): Card {
    if (shoeRef.current.length === 0) shoeRef.current = createShoe();
    return shoeRef.current.pop()!;
  }

  async function settleRound(
    playerFinal: Card[],
    dealerFinal: Card[],
    effectiveWager: number = effectiveWagerRef.current
  ) {
    if (settledRef.current) return;
    settledRef.current = true;

    const outcomeResult = resolveHands(playerFinal, dealerFinal);
    const payoutOutcome = payoutOutcomeForResult(outcomeResult);
    const payout = blackjackPayout(effectiveWager, payoutOutcome);
    const balanceAfter = applyBalanceDelta(payout);
    const { title, subtitle, label } = describeResult(outcomeResult, playerFinal, dealerFinal);

    recordRound({
      gameId: 'blackjack',
      label,
      wager: effectiveWager,
      delta: payout - effectiveWager,
      balanceAfter,
    });

    if (payout > effectiveWager) haptics.win();
    else if (payout === 0) haptics.lose();

    setDealerHoleHidden(false);
    setPhase('settled');
    setIsBusy(false);
    setResult({
      visible: true,
      outcome: outcomeForResult(outcomeResult),
      title,
      subtitle,
      delta: payout - effectiveWager,
      balanceAfter,
    });
  }

  async function onDeal() {
    if (isBusy || phase !== 'betting') return;
    if (!isValidWager(wager, GAME.minWager, balance) || !canAfford(wager)) return;

    haptics.tap();
    settledRef.current = false;
    setIsBusy(true);
    applyBalanceDelta(-wager);
    effectiveWagerRef.current = wager;

    if (shoeRef.current.length < 15) shoeRef.current = createShoe();
    const newPlayer = [drawCard(), drawCard()];
    const newDealer = [drawCard(), drawCard()];

    setDealerHoleHidden(true);
    setPlayerCards(newPlayer);
    setDealerCards(newDealer);
    setPhase('dealing');

    await sleep(650);

    if (isBlackjack(newPlayer) || isBlackjack(newDealer)) {
      setDealerHoleHidden(false);
      await sleep(450);
      await settleRound(newPlayer, newDealer);
      return;
    }

    setPhase('player-turn');
    setIsBusy(false);
  }

  async function onHit() {
    if (isBusy || phase !== 'player-turn') return;
    haptics.tap();
    setIsBusy(true);
    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    await sleep(320);

    if (isBust(next)) {
      await settleRound(next, dealerCards);
      return;
    }
    setIsBusy(false);
  }

  async function onStand() {
    if (isBusy || phase !== 'player-turn') return;
    haptics.tap();
    setIsBusy(true);
    await runDealerTurn(playerCards);
  }

  async function onDoubleDown() {
    if (isBusy || phase !== 'player-turn' || playerCards.length !== 2) return;
    if (!canAfford(wager)) return;
    haptics.tap();
    setIsBusy(true);
    applyBalanceDelta(-wager);
    effectiveWagerRef.current = wager * 2;

    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    await sleep(450);

    if (isBust(next)) {
      await settleRound(next, dealerCards);
      return;
    }
    await runDealerTurn(next);
  }

  async function runDealerTurn(playerFinal: Card[]) {
    setPhase('dealer-turn');
    setDealerHoleHidden(false);
    await sleep(500);

    let dealer = dealerCards;
    while (dealerShouldHit(dealer)) {
      await sleep(600);
      dealer = [...dealer, drawCard()];
      setDealerCards(dealer);
    }

    await sleep(400);
    await settleRound(playerFinal, dealer);
  }

  function onPlayAgain() {
    setResult((s) => ({ ...s, visible: false }));
    setPlayerCards([]);
    setDealerCards([]);
    setDealerHoleHidden(true);
    setPhase('betting');
    setWager((w) => Math.max(0, Math.min(w, balance)));
  }

  const playerTotal = playerCards.length ? handValue(playerCards).total : null;
  const dealerTotal =
    !dealerHoleHidden && dealerCards.length ? handValue(dealerCards).total : null;
  const canDouble = phase === 'player-turn' && playerCards.length === 2 && canAfford(wager);
  const roundActive = phase !== 'betting';
  const chipLabel = PHASE_CHIP[phase];

  return (
    <View style={styles.screen}>
      <GameScreenHeader title="Blackjack" />
      <View style={styles.content}>
        <Text style={styles.rulesBlurb}>
          Dealer stands on 17 · Blackjack pays 2.5× · Push returns your wager
        </Text>

        <View style={[styles.table, { borderColor: GAME.accent }]}>
          {chipLabel ? (
            <Chip label={chipLabel} color={GAME.accent} backgroundColor={GAME.accentSoft} />
          ) : (
            <View style={styles.chipSpacer} />
          )}

          <HandBlock
            label="Dealer"
            cards={dealerCards}
            hideLastCard={dealerHoleHidden}
            total={dealerTotal}
            accent={GAME.accent}
          />
          <View style={styles.tableDivider} />
          <HandBlock
            label="You"
            cards={playerCards}
            hideLastCard={false}
            total={playerTotal}
            accent={GAME.accent}
          />
        </View>

        {phase === 'betting' ? (
          <>
            <WagerBar
              value={wager}
              onChange={setWager}
              min={GAME.minWager}
              max={balance}
              accent={GAME.accent}
              disabled={roundActive}
            />
            <PrimaryButton
              label="Deal"
              color={GAME.accent}
              disabled={isBusy || !isValidWager(wager, GAME.minWager, balance) || !canAfford(wager)}
              onPress={onDeal}
            />
          </>
        ) : (
          <View style={styles.actionsRow}>
            <GhostButton
              label="Hit"
              color={GAME.accent}
              disabled={isBusy || phase !== 'player-turn'}
              onPress={onHit}
              style={styles.actionFlex}
            />
            {canDouble && (
              <GhostButton
                label="Double"
                color={GAME.accent}
                disabled={isBusy}
                onPress={onDoubleDown}
                style={styles.actionFlex}
              />
            )}
            <PrimaryButton
              label="Stand"
              color={GAME.accent}
              disabled={isBusy || phase !== 'player-turn'}
              onPress={onStand}
              style={styles.actionFlex}
            />
          </View>
        )}
      </View>

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
        onSecondary={() => {
          setResult((s) => ({ ...s, visible: false }));
        }}
      />
    </View>
  );
}

function HandBlock({
  label,
  cards,
  hideLastCard,
  total,
  accent,
}: {
  label: string;
  cards: Card[];
  hideLastCard: boolean;
  total: number | null;
  accent: string;
}) {
  return (
    <View style={styles.handBlock}>
      <View style={styles.handHeaderRow}>
        <Text style={styles.handLabel}>{label}</Text>
        <Text style={[styles.handTotal, { color: accent }]}>{total === null ? '—' : total}</Text>
      </View>
      <View style={styles.handCards}>
        {cards.length === 0 ? (
          <View style={styles.emptySlot}>
            <Ionicons name="hardware-chip-outline" size={18} color={colors.border} />
          </View>
        ) : (
          cards.map((card, i) => (
            <PlayingCard
              key={i}
              index={i}
              card={card}
              hidden={hideLastCard && i === cards.length - 1}
            />
          ))
        )}
      </View>
    </View>
  );
}

function PlayingCard({ card, hidden, index }: { card: Card; hidden: boolean; index: number }) {
  const [translateY] = useState(() => new Animated.Value(14));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const delay = Math.min(index, 4) * 90;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 260, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 260, delay, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRed = RED_SUITS.has(card.suit);

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
      {hidden ? (
        <Ionicons name="hardware-chip-outline" size={18} color={colors.border} />
      ) : (
        <>
          <Text style={[styles.cardRank, { color: isRed ? colors.negative : colors.text }]}>
            {card.rank}
          </Text>
          <Text style={[styles.cardSuit, { color: isRed ? colors.negative : colors.text }]}>
            {SUIT_SYMBOL[card.suit]}
          </Text>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: space.lg, gap: space.lg },

  rulesBlurb: { fontSize: 11, color: colors.muted, textAlign: 'center' },

  table: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  chipSpacer: { height: 24 },
  tableDivider: { height: 1, backgroundColor: colors.border },

  handBlock: { gap: space.sm },
  handHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  handLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  handTotal: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  handCards: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },

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
  cardRank: { fontSize: 16, fontWeight: '800' },
  cardSuit: { fontSize: 14, fontWeight: '700', marginTop: 2 },
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

  actionsRow: { flexDirection: 'row', gap: space.sm },
  actionFlex: { flex: 1 },
});
