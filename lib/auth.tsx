import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearTokens,
  loginRequest,
  logoutRequest,
  registerRequest,
  saveTokens,
  setSignedOutHandler,
  type Session,
  type User,
} from './api';

const USER_KEY = 'user';

type AuthValue = {
  user: User | null;
  /** True until the stored session has been read. The splash stays up meanwhile. */
  isLoading: boolean;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useSession(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useSession must be used inside <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The stored user is who we believe we are; the tokens decide whether we
  // still are. A dead token surfaces on the first request, which signs us out.
  useEffect(() => {
    SecureStore.getItemAsync(USER_KEY)
      .then((raw) => raw && setUser(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const forgetSession = useCallback(async () => {
    setUser(null);
    await SecureStore.deleteItemAsync(USER_KEY);
  }, []);

  // api.ts calls this when a refresh fails, i.e. the session is unrecoverable.
  useEffect(() => {
    setSignedOutHandler(() => void forgetSession());
  }, [forgetSession]);

  const startSession = useCallback(async (session: Session) => {
    await Promise.all([
      saveTokens(session),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
    ]);
    setUser(session.user);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      isLoading,
      signIn: async (input) => startSession(await loginRequest(input)),
      signUp: async (input) => startSession(await registerRequest(input)),
      signOut: async () => {
        await logoutRequest().catch(() => clearTokens());
        await forgetSession();
      },
    }),
    [user, isLoading, startSession, forgetSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
