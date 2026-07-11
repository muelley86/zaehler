/**
 * Offline-UI-Bausteine: Provider spiegelt das Konnektivitäts-Signal,
 * Banner und "Stand von"-Chip erscheinen nur offline.
 */

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { OfflineBanner } from '@/components/OfflineBanner';
import { StaleDataHint } from '@/components/StaleDataHint';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthState } from '@/features/auth/auth-context';
import { reportOffline, reportOnline } from '@/lib/offline/connectivity';
import { resetOfflineDbForTests } from '@/lib/offline/db';
import { enqueueGroup, listItems, updateItem } from '@/lib/offline/outbox';
import type { Me } from '@/lib/types';
import { server } from '@/tests/server';
import { useOnlineStatus } from './offline-context';
import { OnlineStatusProvider } from './OnlineStatusProvider';

function Probe() {
  const { isOnline } = useOnlineStatus();
  return <div>{isOnline ? 'online' : 'offline'}</div>;
}

afterEach(() => {
  act(() => reportOnline());
});

describe('OnlineStatusProvider', () => {
  it('spiegelt Konnektivitäts-Reports in den Context', () => {
    render(
      <OnlineStatusProvider>
        <Probe />
      </OnlineStatusProvider>,
    );
    expect(screen.getByText('online')).toBeInTheDocument();

    act(() => reportOffline());
    expect(screen.getByText('offline')).toBeInTheDocument();

    act(() => reportOnline());
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('Browser-Event offline schaltet den Zustand um', () => {
    render(
      <OnlineStatusProvider>
        <Probe />
      </OnlineStatusProvider>,
    );
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('ohne Provider gilt der Default "online" (stille Degradation)', () => {
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });
});

describe('OfflineBanner', () => {
  it('online unsichtbar, offline sichtbar', () => {
    render(
      <OnlineStatusProvider>
        <OfflineBanner />
      </OnlineStatusProvider>,
    );
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();

    act(() => reportOffline());
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/Offline/);
  });
});

const ME: Me = {
  id: 7,
  username: 'anna',
  email: null,
  role: 'recorder',
  is_active: true,
  force_password_change: false,
  totp_enabled: false,
  can_assign_qr_tokens: false,
  last_login_at: null,
};

const AUTH: AuthState = {
  me: ME,
  loading: false,
  login: () => Promise.reject(new Error('nicht im Test')),
  verifyTotp: () => Promise.reject(new Error('nicht im Test')),
  logout: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
};

function ProbeOldest() {
  const { pendingCount, oldestPendingAt } = useOnlineStatus();
  return <div>{`${pendingCount}:${oldestPendingAt ?? 'null'}`}</div>;
}

describe('OnlineStatusProvider oldestPendingAt', () => {
  it('liefert das älteste createdAt der offenen Einträge in den Context', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetOfflineDbForTests();
    // Der Sync-Versuch beim Mount scheitert als Netzfehler — Items bleiben liegen.
    server.use(http.post('/api/v1/readings', () => HttpResponse.error()));

    await enqueueGroup({
      userId: 7,
      readings: [
        {
          registerId: 12,
          mpName: 'Hauptzähler Strom',
          registerLabel: 'Bezug',
          registerUnit: 'kWh',
          obisCode: '1.8.0',
          value: '100.5',
          readingAt: '2026-07-10T18:00:00Z',
          note: null,
        },
      ],
      photos: [],
    });
    const [item] = await listItems(7);
    await updateItem(item?.id ?? '', { createdAt: '2026-07-01T06:00:00Z' });

    render(
      <AuthContext.Provider value={AUTH}>
        <OnlineStatusProvider>
          <ProbeOldest />
        </OnlineStatusProvider>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('1:2026-07-01T06:00:00Z')).toBeInTheDocument();
  });
});

describe('StaleDataHint', () => {
  it('online nichts, offline "Stand von <Datum>"', () => {
    const servedAt = new Date('2026-07-10T08:30:00Z');
    render(
      <OnlineStatusProvider>
        <StaleDataHint servedAt={servedAt} />
      </OnlineStatusProvider>,
    );
    expect(screen.queryByTestId('stale-data-hint')).not.toBeInTheDocument();

    act(() => reportOffline());
    expect(screen.getByTestId('stale-data-hint')).toHaveTextContent(/Stand von/);
  });

  it('ohne servedAt auch offline nichts', () => {
    render(
      <OnlineStatusProvider>
        <StaleDataHint servedAt={null} />
      </OnlineStatusProvider>,
    );
    act(() => reportOffline());
    expect(screen.queryByTestId('stale-data-hint')).not.toBeInTheDocument();
  });
});
