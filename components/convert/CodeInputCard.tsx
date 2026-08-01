/**
 * Voucher-style code entry card: letter-spaced uppercase TextInput with a
 * Paste button, plus the full-width Redeem button. Owns no redemption logic —
 * the screen passes state down and handles presses.
 *
 * The button styling deliberately duplicates the Play PrimaryButton look
 * rather than importing from `components/play/` so Convert stays decoupled
 * from files other agents are editing.
 */

import { forwardRef } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';

type Props = {
  code: string;
  onChangeCode: (code: string) => void;
  onPaste: () => void;
  onRedeem: () => void;
  /** Fake-validation in flight: spinner shown, everything disabled. */
  busy: boolean;
  /** False until a provider is selected and the input is non-empty. */
  canRedeem: boolean;
};

const CodeInputCard = forwardRef<TextInput, Props>(function CodeInputCard(
  { code, onChangeCode, onPaste, onRedeem, busy, canRedeem },
  ref
) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Promo code</Text>

      <View style={styles.inputRow}>
        <TextInput
          ref={ref}
          style={styles.input}
          value={code}
          onChangeText={onChangeCode}
          editable={!busy}
          placeholder="E.G. OPENAI-500"
          placeholderTextColor={colors.muted}
          keyboardAppearance="dark"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="go"
          onSubmitEditing={canRedeem && !busy ? onRedeem : undefined}
          accessibilityLabel="Promo code"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paste code from clipboard"
          onPress={onPaste}
          disabled={busy}
          hitSlop={4}
          style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}>
          <Ionicons name="clipboard-outline" size={14} color={colors.accent} />
          <Text style={styles.pasteText}>Paste</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Redeem code"
        accessibilityState={{ disabled: !canRedeem || busy, busy }}
        onPress={onRedeem}
        disabled={!canRedeem || busy}
        style={({ pressed }) => [
          styles.redeemButton,
          (!canRedeem || busy) && styles.redeemDisabled,
          pressed && canRedeem && !busy && styles.pressed,
        ]}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.redeemText}>Redeem</Text>
        )}
      </Pressable>
    </View>
  );
});

export default CodeInputCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.text,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    backgroundColor: colors.accentSoft,
  },
  pasteText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  redeemButton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemDisabled: { opacity: 0.4 },
  redeemText: { fontSize: 16, fontWeight: '700', color: colors.onAccent },
  pressed: { opacity: 0.7 },
});
