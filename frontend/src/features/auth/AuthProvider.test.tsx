/**
 * Offline-Kaltstart-Verhalten des AuthProviders: Ist der Server beim
 * App-Start nicht erreichbar (NetworkError statt 401), wird der letzte
 * bekannte User aus dem localStorage-Snapshot wiederhergestellt, damit die
 * App mit gecachten Daten rendert statt auf "Lade…" zu hängen.
 *
 * Zusätzlich: `logout()` und der 401-Zweig von `refresh()` müssen neben dem
 * Me-Snapshot auch den modul-weiten Dashboard-Cache purgen (sonst könnte ein
 * User-Wechsel im selben Tab im ersten Frame noch die MP-gefilterten
 * Aggregate des vorherigen Users zeigen) — per `vi.mock` als Spy auf die
 * echte Implementierung geprüft, damit das reale Cache-Verhalten unverändert
 * bleibt.
 */

import { http, HttpResponse } from 'msw';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/tests/server';
import { clearDashboardCache } from '@/features/dashboard/useDashboardData';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './auth-context';

vi.mock('@/features/dashboard/useDashboardData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/dashboard/useDashboardData')>();
  return { ...actual, clearDashboardCache: vi.fn(actual.clearDashboardCache) };
});

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

/** Wie `Probe`, aber mit einem Button, der `logout()` auslöst. */
function LogoutProbe() {
  const { me, loading, logout } = useAuth();
  if (loading) return <div>lade</div>;
  return (
    <div>
      <div>{me ? `user:${me.username}` : 'kein-user'}</div>
      <button type="button" onClick={() => void logout()}>
        Abmelden
      </button>
    </div>
  );
}

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
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
    expect(clearDashboardCache).toHaveBeenCalled();
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

describe('AuthProvider — logout()', () => {
  it('purgt Me-Snapshot UND den modul-weiten Dashboard-Cache', async () => {
    localStorage.setItem(
      ME_SNAPSHOT_KEY,
      JSON.stringify({ me: testMe, savedAt: '2026-07-10T08:00:00Z' }),
    );
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(testMe)),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );

    render(
      <AuthProvider>
        <LogoutProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('user:katrin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(await screen.findByText('kein-user')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(ME_SNAPSHOT_KEY)).toBeNull());
    expect(clearDashboardCache).toHaveBeenCalled();
  });
});
