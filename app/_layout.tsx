import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { AuthProvider, useSession } from '../lib/auth';
import { flush } from '../lib/play/sync';

SplashScreen.preventAutoHideAsync();

/**
 * Drains queued rounds once there is a session to send them under, and again
 * whenever the app comes back to the foreground — the usual moment for a device
 * that was offline mid-round to have regained a connection.
 */
function SyncOnForeground() {
  const { user } = useSession();

  useEffect(() => {
    if (!user) return;
    void flush();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void flush());
    return () => sub.remove();
  }, [user]);

  return null;
}

/** Holds the splash until we know whether there is a session, so neither group flashes. */
function SplashGate() {
  const { isLoading } = useSession();
  if (!isLoading) SplashScreen.hide();
  return null;
}

function RootNavigator() {
  const { user } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <SplashGate />
      <SyncOnForeground />
      <RootNavigator />
    </AuthProvider>
  );
}
