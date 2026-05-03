/**
 * React-Context, der den aktuell angemeldeten User bereitstellt.
 *
 * Beim ersten Render wird `/auth/me` aufgerufen, um eine bestehende Session
 * zu erkennen (HTTP-Cookie ist httpOnly, das Frontend kann ihn nicht lesen).
 * Liefert `me`, `loading`, plus `login`/`verifyTotp`/`logout`/`refresh`.
 *
 * Login ist zweistufig: `login()` liefert entweder `{ kind: 'ok', me }` oder
 * `{ kind: 'totp', challengeToken }`. Im zweiten Fall muss der Caller
 * `verifyTotp(challengeToken, code)` aufrufen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, api } from '@/lib/api';
import type { LoginResponse, Me } from '@/lib/types';

export type LoginResult =
  | { kind: 'ok'; me: Me }
  | { kind: 'totp'; challengeToken: string };

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  verifyTotp: (challengeToken: string, code: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<Me>('/auth/me');
      setMe(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const data = await api.post<LoginResponse>('/auth/login', { username, password });
    if (data.requires_2fa && data.challenge_token) {
      return { kind: 'totp', challengeToken: data.challenge_token };
    }
    if (data.me) {
      setMe(data.me);
      return { kind: 'ok', me: data.me };
    }
    throw new Error('Login-Antwort ohne me oder challenge_token');
  }, []);

  const verifyTotp = useCallback(async (challengeToken: string, code: string) => {
    const data = await api.post<Me>('/auth/2fa/verify', {
      challenge_token: challengeToken,
      code,
    });
    setMe(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setMe(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ me, loading, login, verifyTotp, logout, refresh }),
    [me, loading, login, verifyTotp, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
