import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../lib/api';
import { useSession } from '../lib/auth';
import { colors, radius, space } from '../lib/theme';

/** Backend error codes the user can actually act on. Anything else is our fault. */
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'That email and password do not match.',
  EMAIL_TAKEN: 'An account with that email already exists.',
  INVALID_INPUT: 'Check your email, and use a password of at least 8 characters.',
  TOO_MANY_REQUESTS: 'Too many attempts. Wait a minute and try again.',
};

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signUp } = useSession();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await signUp({ email, password, displayName });
      else await signIn({ email, password });
      // Pushed from the profile sheet as a normal stack screen now (the app
      // is never gated behind auth), so success just closes it.
      router.back();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      const rateLimited = e instanceof ApiError && e.status === 429;
      setError(
        MESSAGES[rateLimited ? 'TOO_MANY_REQUESTS' : code] ??
          'Could not reach the server. Is the API running?',
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setIsRegister((v) => !v);
    setError(null);
  }

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && (!isRegister || displayName.trim().length > 0);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <Text style={styles.closeButtonLabel}>✕</Text>
        </Pressable>

        <Text style={[styles.title, { marginTop: space.lg }]}>
          {isRegister ? 'Create account' : 'Welcome back'}
        </Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Simulated credits. No real money.' : 'Sign in to your wallet.'}
        </Text>

        <View style={styles.form}>
          {isRegister && (
            <Field
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              textContentType="name"
            />
          )}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            // Lets the OS offer to generate and save a strong password.
            textContentType={isRegister ? 'newPassword' : 'password'}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit || busy}
            onPress={submit}
            style={({ pressed }) => [
              styles.submit,
              (!canSubmit || busy) && styles.submitDisabled,
              pressed && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.submitLabel}>{isRegister ? 'Create account' : 'Sign in'}</Text>
            )}
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={toggleMode} style={styles.toggle}>
          <Text style={styles.toggleText}>
            {isRegister ? 'Already have an account? ' : 'New here? '}
            <Text style={styles.toggleAction}>{isRegister ? 'Sign in' : 'Create one'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeButtonLabel: { fontSize: 15, fontWeight: '700', color: colors.muted },

  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },

  form: { marginTop: space.xl, gap: space.lg },
  label: {
    marginBottom: space.sm,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.muted,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    fontSize: 16,
    color: colors.text,
  },

  error: { fontSize: 13, color: colors.negative },

  submit: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  submitDisabled: { opacity: 0.4 },
  submitLabel: { fontSize: 16, fontWeight: '700', color: colors.surface },
  pressed: { opacity: 0.7 },

  toggle: { marginTop: space.xl, alignItems: 'center' },
  toggleText: { fontSize: 14, color: colors.muted },
  toggleAction: { fontWeight: '700', color: colors.accent },
});
