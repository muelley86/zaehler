/**
 * Auth-Context-Definition + useAuth-Hook in eigener Datei, damit der
 * Provider-Component (`AuthProvider.tsx`) nur noch JSX exportiert und
 * Vites Fast-Refresh-Heuristik nicht durch zusätzliche Hook-Exports
 * gestört wird.
 */

import { createContext, useContext } from 'react';

import type { LoginResponse, Me } from '@/lib/types';

export type LoginResult = { kind: 'ok'; me: Me } | { kind: 'totp'; challengeToken: string };

export interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  verifyTotp: (challengeToken: string, code: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

// Re-Export für Imports, die das LoginResponse-Typ-Stück brauchen.
export type { LoginResponse };
