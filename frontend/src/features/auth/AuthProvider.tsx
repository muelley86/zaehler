/**
 * AuthProvider — füllt den AuthContext bei React-Mount mit dem
 * aktuell angemeldeten User (`/auth/me`-Roundtrip) und stellt
 * login/verifyTotp/logout/refresh bereit.
 *
 * Hook + Context-Definition liegen in `auth-context.ts`, damit Vites
 * Fast-Refresh nicht durch zusätzliche Nicht-Component-Exports
 * gestört wird.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, api } from '@/lib/api';
import type { LoginResponse, Me } from '@/lib/types';
import { AuthContext } from './auth-context';
import type { AuthState, LoginResult } from './auth-context';

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
