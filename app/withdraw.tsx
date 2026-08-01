import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GameScreenHeader from '../components/play/GameScreenHeader';
import AmountEntry from '../components/withdraw/AmountEntry';
import BalanceCard from '../components/withdraw/BalanceCard';
import ConfirmButton from '../components/withdraw/ConfirmButton';
import DemoBanner from '../components/withdraw/DemoBanner';
import MethodSelector from '../components/withdraw/MethodSelector';
import RecentWithdrawals from '../components/withdraw/RecentWithdrawals';
import SuccessView from '../components/withdraw/SuccessView';
import SummaryCard from '../components/withdraw/SummaryCard';
import { applyAndRecord } from '../lib/ledger/ledgerStore';
import { useBalance } from '../lib/play/balanceStore';
import { formatTokens } from '../lib/play/format';
import { haptics } from '../lib/play/haptics';
import { colors, space } from '../lib/theme';
import { feeFor, MIN_WITHDRAWAL, PAYOUT_METHODS } from '../lib/withdraw/methods';

const PROCESSING_MS = 1200;
const MAX_DIGITS = 7;
const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** e.g. "WD-K3F9QZ" — purely cosmetic receipt identifier for the demo. */
function makeReferenceId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return `WD-${suffix}`;
}

type Phase = 'form' | 'processing' | 'success';

type Receipt = {
  net: number;
  referenceId: string;
  methodLabel: string;
  methodDetail: string;
  eta: string;
};

export default function WithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { balance } = useBalance();

  const [amountText, setAmountText] = useState('');
  const [methodId, setMethodId] = useState(PAYOUT_METHODS[0].id);
  const [phase, setPhase] = useState<Phase>('form');
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // Synchronous submission lock: 'inflight' from the moment the confirm tap
  // is accepted until the ledger write settles, so a double-tap (or a tap
  // racing the processing delay) can never debit the balance twice.
  const lockRef = useRef<'idle' | 'inflight' | 'settled'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      // Leaving mid-processing cancels the demo withdrawal outright — better
      // an un-debited balance than a ledger write after unmount.
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const amount = amountText === '' ? 0 : parseInt(amountText, 10);
  const method = PAYOUT_METHODS.find((m) => m.id === methodId) ?? PAYOUT_METHODS[0];
  const fee = feeFor(amount, method);
  const net = Math.round((amount - fee) * 100) / 100;
  const maxAmount = Math.floor(balance);

  const error =
    amount === 0
      ? null
      : amount < MIN_WITHDRAWAL
        ? `Minimum withdrawal is ${formatTokens(MIN_WITHDRAWAL)} tokens`
        : amount > balance
          ? 'Insufficient balance'
          : null;
  const valid = amount >= MIN_WITHDRAWAL && amount <= balance;
  const processing = phase === 'processing';

  const handleAmountText = (text: string) => {
    // Integers only: strip non-digits and redundant leading zeros.
    const digits = text.replace(/[^0-9]/g, '').slice(0, MAX_DIGITS);
    setAmountText(digits.replace(/^0+(?=\d)/, ''));
  };

  const handleConfirm = () => {
    if (lockRef.current !== 'idle') return;
    if (phase !== 'form' || !valid) return;
    lockRef.current = 'inflight';

    // Snapshot the submission so later edits to state can't change what settles.
    const submitted = { amount, net, method };
    setPhase('processing');

    timerRef.current = setTimeout(() => {
      if (lockRef.current !== 'inflight') return;
      lockRef.current = 'settled';
      applyAndRecord({
        kind: 'withdrawal',
        label: `Withdrawal to ${submitted.method.label} ${submitted.method.detail}`,
        delta: -submitted.amount,
        status: 'demo',
      });
      haptics.win();
      setReceipt({
        net: submitted.net,
        referenceId: makeReferenceId(),
        methodLabel: submitted.method.label,
        methodDetail: submitted.method.detail,
        eta: submitted.method.eta,
      });
      setPhase('success');
    }, PROCESSING_MS);
  };

  const handleReset = () => {
    lockRef.current = 'idle';
    setAmountText('');
    setReceipt(null);
    setPhase('form');
  };

  return (
    <View style={styles.screen}>
      <GameScreenHeader title="Withdraw" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}>
        {phase === 'success' && receipt !== null ? (
          <SuccessView
            net={receipt.net}
            referenceId={receipt.referenceId}
            methodLabel={receipt.methodLabel}
            methodDetail={receipt.methodDetail}
            eta={receipt.eta}
            onReset={handleReset}
            onDone={() => router.back()}
          />
        ) : (
          <>
            <BalanceCard balance={balance} />
            <AmountEntry
              value={amountText}
              amount={amount}
              minAmount={MIN_WITHDRAWAL}
              maxAmount={maxAmount}
              error={error}
              disabled={processing}
              onChangeText={handleAmountText}
              onPreset={(preset) => setAmountText(String(preset))}
            />
            <MethodSelector
              methods={PAYOUT_METHODS}
              selectedId={methodId}
              onSelect={setMethodId}
              disabled={processing}
            />
            {valid && <SummaryCard amount={amount} fee={fee} net={net} eta={method.eta} />}
            <ConfirmButton
              label={valid ? `Withdraw ${formatTokens(net)} tokens` : 'Continue'}
              onPress={handleConfirm}
              disabled={!valid}
              processing={processing}
            />
            <RecentWithdrawals />
          </>
        )}
        <DemoBanner />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.xl,
  },
});
