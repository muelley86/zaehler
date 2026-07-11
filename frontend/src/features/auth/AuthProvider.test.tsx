/**
 * Offline-Kaltstart-Verhalten des AuthProviders: Ist der Server beim
 * App-Start nicht erreichbar (NetworkError statt 401), wird der letzte
 * bekannte User aus dem localStorage-Snapshot wiederhergestellt, damit die
 * App mit gecachten Daten rendert statt auf "Lade…" zu hängen.
 */

import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from '@/tests/server';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './auth-context';

const ME_SNAPSHOT_KEY = 'offline.me';

const testMe = {
  id: 7,
  username: 'katrin',
  email: null,
  role: 'recorder' as const,
  is_active: true,
  force_password_change: false,
  totp_enabled: false,
  can_assign_qr_tokens: false,
  last_login_at: null,
};

function Probe() {
  const { me, loading } = useAuth();
  if (loading) return <div>lade</div>;
  return <div>{me ? `user:${me.username}` : 'kein-user'}</div>;
}

afterEach(() => {
  localStorage.clear();
});

describe('AuthProvider — Offline-Kaltstart', () => {
  it('erfolgreiches /auth/me persistiert einen Me-Snapshot', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(testMe)));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText('user:katrin')).toBeInTheDocument();
    await waitFor(() => {
      const raw = localStorage.getItem(ME_SNAPSHOT_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? '{}')).toMatchObject({ me: { username: 'katrin' } });
    });
  });

  it('Netzfehler + Snapshot → letzter bekannter User wird wiederhergestellt', async () => {
    localStorage.setItem(
      ME_SNAPSHOT_KEY,
      JSON.stringify({ me: testMe, savedAt: '2026-07-10T08:00:00Z' }),
    );
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.error()));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText('user:katrin')).toBeInTheDocument();
  });

  it('Netzfehler ohne Snapshot → kein User (Login-Seite)', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.error()));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText('kein-user')).toBeInTheDocument();
  });

  it('401 → kein User und Snapshot wird gelöscht', async () => {
    localStorage.setItem(
      ME_SNAPSHOT_KEY,
      JSON.stringify({ me: testMe, savedAt: '2026-07-10T08:00:00Z' }),
    );
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 }),
      ),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText('kein-user')).toBeInTheDocument();
    expect(localStorage.getItem(ME_SNAPSHOT_KEY)).toBeNull();
  });

  it('kaputter Snapshot (ungültiges JSON) wird ignoriert', async () => {
    localStorage.setItem(ME_SNAPSHOT_KEY, '{nicht-json');
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.error()));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText('kein-user')).toBeInTheDocument();
  });
});
