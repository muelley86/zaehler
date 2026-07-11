/**
 * Regressionstest: Ein Sync-Lauf, der noch für den VORHERIGEN User in der
 * Luft hängt, darf sein Ergebnis nicht auf den Scheduler des neuen Users
 * anwenden (würde dessen Backoff verfälschen bzw. Phantom-Retries armen).
 */

import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-context';
import type { AuthState } from '@/features/auth/auth-context';
import { runSync } from '@/lib/offline/syncEngine';
import type { SyncResult } from '@/lib/offline/syncEngine';
import type { Me } from '@/lib/types';
import { server } from '@/tests/server';
import { OnlineStatusProvider } from './OnlineStatusProvider';

vi.mock('@/lib/offline/syncEngine', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/offline/syncEngine')>();
  return { ...mod, runSync: vi.fn() };
});

function makeAuth(id: number): AuthState {
  const me: Me = {
    id,
    username: `user${id}`,
    email: null,
    role: 'recorder',
    is_active: true,
    force_password_change: false,
    totp_enabled: false,
    can_assign_qr_tokens: false,
    last_login_at: null,
  };
  return {
    me,
    loading: false,
    login: () => Promise.reject(new Error('nicht im Test')),
    verifyTotp: () => Promise.reject(new Error('nicht im Test')),
    logout: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(runSync).mockReset();
});

describe('OnlineStatusProvider bei User-Wechsel', () => {
  it('wendet ein veraltetes Sync-Ergebnis nicht auf den Scheduler des neuen Users an', async () => {
    server.use(http.get('/api/v1/measuring-points', () => HttpResponse.json([])));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Ref-Objekt statt let: TS verengt die Closure-Zuweisung sonst auf never.
    const stale: { resolve: ((r: SyncResult) => void) | null } = { resolve: null };
    vi.mocked(runSync)
      // Lauf von User 1 hängt (Funkloch) …
      .mockImplementationOnce(
        () =>
          new Promise<SyncResult>((resolve) => {
            stale.resolve = resolve;
          }),
      )
      // … alle weiteren Läufe (User 2) enden sauber.
      .mockResolvedValue({ synced: 0, conflicts: 0, stopped: 'done' });

    const { rerender } = render(
      <AuthContext.Provider value={makeAuth(1)}>
        <OnlineStatusProvider>
          <div />
        </OnlineStatusProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));

    rerender(
      <AuthContext.Provider value={makeAuth(2)}>
        <OnlineStatusProvider>
          <div />
        </OnlineStatusProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(2));

    // Der hängende Lauf von User 1 endet erst JETZT — als Netzfehler.
    stale.resolve?.({ synced: 0, conflicts: 0, stopped: 'offline' });
    await vi.advanceTimersByTimeAsync(31_000);

    // Ohne Guard würde User-2s Scheduler daraus einen Retry armen (3. Lauf).
    expect(runSync).toHaveBeenCalledTimes(2);
  });
});
