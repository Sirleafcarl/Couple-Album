import type { LoginInput, SessionUser } from '@memory/contracts/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getSession,
  login,
  logout,
} from '../api/auth.js';

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  signIn(input: LoginInput): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void getSession()
      .then((response) => {
        if (active) setUser(response?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signIn(input) {
        const response = await login(input);
        setUser(response.user);
      },
      async signOut() {
        await logout();
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
