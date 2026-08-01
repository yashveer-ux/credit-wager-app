import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useSession } from '../lib/auth';

SplashScreen.preventAutoHideAsync();

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
      <RootNavigator />
    </AuthProvider>
  );
}
