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
 * that was offline mid-round to have regained a connection. A no-op for guests.
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

/** Holds the splash until we know whether there is a stored session, then always shows the app. */
function SplashGate() {
  const { isLoading } = useSession();
  if (!isLoading) SplashScreen.hide();
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <SplashGate />
      <SyncOnForeground />
      {/*
       * The app is never gated behind sign-in — everyone lands on the tabs
       * as a guest. `login.tsx` is a normal pushed screen (opened from the
       * profile sheet), not a route group swap, so it just sits alongside
       * (tabs) here like any other top-level screen (e.g. `withdraw.tsx`).
       */}
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
