/**
 * Convert tab: redeem fictional AI-provider promo codes for AI Tokens.
 *
 * Flow: pick a provider → enter/paste a code → Redeem → ~600ms fake local
 * validation → on success the balance is credited exactly once through
 * `applyAndRecord` (which also writes the shared transaction history) and the
 * code is remembered in `redemptionStore` so it can never be redeemed twice.
 *
 * Exactly-once guarantees: a ref-based in-flight lock plus a disabled button
 * block double-taps; `validateCode` returns 'already-used' for anything in
 * the redeemed set, and only the 'valid' branch ever touches the balance.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CodeInputCard from '../../components/convert/CodeInputCard';
import ProviderSelector from '../../components/convert/ProviderSelector';
import RecentRedemptions from '../../components/convert/RecentRedemptions';
import ResultBanner, { type RedeemOutcome } from '../../components/convert/ResultBanner';
import { normalizeCode, validateCode, type Provider } from '../../lib/convert/codes';
import { hydrateRedemptions, markRedeemed, useRedeemedCodes } from '../../lib/convert/redemptionStore';
import { applyAndRecord, useLedger } from '../../lib/ledger/ledgerStore';
import { useBalance } from '../../lib/play/balanceStore';
import { formatTokens } from '../../lib/play/format';
import { haptics } from '../../lib/play/haptics';
import { colors, radius, space } from '../../lib/theme';

const VALIDATION_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ConvertScreen() {
  const insets = useSafeAreaInsets();
  const { balance, hydrated } = useBalance();
  const ledger = useLedger();
  // Kick off hydration of the redeemed-code set as soon as the tab mounts.
  useRedeemedCodes();

  const promoEntries = useMemo(() => ledger.filter((e) => e.kind === 'promo'), [ledger]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RedeemOutcome | null>(null);
  const inFlight = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const onSelectProvider = useCallback((provider: Provider) => {
    haptics.select();
    setSelectedId(provider.id);
    setOutcome(null);
  }, []);

  const onChangeCode = useCallback((text: string) => {
    setCode(text.toUpperCase());
    setOutcome(null);
  }, []);

  const onPaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text.trim()) {
        haptics.select();
        setCode(normalizeCode(text));
        setOutcome(null);
        return;
      }
    } catch {
      // Clipboard unavailable — fall through to focusing the input.
    }
    inputRef.current?.focus();
  }, []);

  const onRedeem = useCallback(async () => {
    // Ref-based lock: even if a second tap lands before React re-renders the
    // disabled button, it bails here and no code can be validated twice
    // concurrently.
    if (inFlight.current) return;
    if (!selectedId || !normalizeCode(code)) return;
    inFlight.current = true;
    setBusy(true);
    setOutcome(null);
    Keyboard.dismiss();

    try {
      // Fake validation latency; also guarantees the persisted redeemed set
      // is loaded before we decide, so 'already-used' survives app restarts.
      await Promise.all([delay(VALIDATION_DELAY_MS), hydrateRedemptions()]);

      const result = validateCode(selectedId, code);
      if (result.status === 'valid') {
        const normalized = normalizeCode(code);
        // The single balance mutation: credits once and writes the ledger
        // entry atomically. Immediately mark the code used.
        applyAndRecord({
          kind: 'promo',
          label: `Promo code ${normalized}`,
          provider: result.provider.name,
          delta: result.tokens,
        });
        markRedeemed(normalized);
        haptics.win();
        setCode('');
        setOutcome({
          status: 'success',
          tokens: result.tokens,
          providerName: result.provider.name,
        });
      } else {
        haptics.warn();
        setOutcome(
          result.status === 'wrong-provider'
            ? { status: 'wrong-provider', expectedProviderName: result.expectedProvider.name }
            : { status: result.status }
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [code, selectedId]);

  const canRedeem = selectedId !== null && normalizeCode(code).length > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Convert</Text>
        <View style={styles.balancePill}>
          <Ionicons name="hardware-chip" size={13} color={colors.accent} />
          <Text style={styles.balanceText} numberOfLines={1}>
            {hydrated ? formatTokens(balance) : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.howCard}>
        <Text style={styles.howTitle}>How it works</Text>
        <HowStep n={1} text="Pick the AI provider that issued your promo code." />
        <HowStep n={2} text="Enter or paste the code and tap Redeem." />
        <HowStep n={3} text="AI Tokens land in your balance instantly." />
        <Text style={styles.howHint}>All demo — try a code like OPENAI-500.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Provider</Text>
        <ProviderSelector selectedId={selectedId} onSelect={onSelectProvider} />
      </View>

      <CodeInputCard
        ref={inputRef}
        code={code}
        onChangeCode={onChangeCode}
        onPaste={onPaste}
        onRedeem={onRedeem}
        busy={busy}
        canRedeem={canRedeem}
      />

      {outcome && <ResultBanner outcome={outcome} />}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent redemptions</Text>
        <RecentRedemptions entries={promoEntries} />
      </View>

      <Text style={styles.disclaimer}>
        Providers and promo codes on this screen are fictional demo data. AI Tokens are a virtual
        currency with no real-world value, and nothing here connects to any real AI provider.
      </Text>
    </ScrollView>
  );
}

function HowStep({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howBubble}>
        <Text style={styles.howBubbleText}>{n}</Text>
      </View>
      <Text style={styles.howText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.lg },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
  },
  balanceText: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

  howCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm + 2,
  },
  howTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  howBubble: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  howBubbleText: { fontSize: 11, fontWeight: '800', color: colors.accent },
  howText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  howHint: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.accent },

  section: { gap: space.md },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.text },

  disclaimer: { fontSize: 11, color: colors.muted, lineHeight: 16, textAlign: 'center' },
});
