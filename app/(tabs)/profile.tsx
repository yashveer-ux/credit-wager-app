import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../../lib/auth';
import { colors, radius, space } from '../../lib/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    // signOut clears local state even if revoking the token server side fails,
    // so there is no path where the button leaves the user stuck signed in.
    await signOut();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxl },
      ]}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={styles.name}>{user?.displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={handleSignOut}
        style={({ pressed }) => [styles.signOut, (pressed || busy) && styles.pressed]}>
        <Ionicons name="log-out-outline" size={18} color={colors.negative} />
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.lg },

  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.text },

  card: {
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: space.sm,
  },
  avatarText: { fontSize: 26, fontWeight: '700', color: colors.accent },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  email: { fontSize: 14, color: colors.muted },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.lg,
  },
  signOutLabel: { fontSize: 15, fontWeight: '600', color: colors.negative },
  pressed: { opacity: 0.6 },
});
