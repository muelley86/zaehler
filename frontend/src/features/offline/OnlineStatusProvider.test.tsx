/**
 * Offline-UI-Bausteine: Provider spiegelt das Konnektivitäts-Signal,
 * Banner und "Stand von"-Chip erscheinen nur offline.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { OfflineBanner } from '@/components/OfflineBanner';
import { StaleDataHint } from '@/components/StaleDataHint';
import { reportOffline, reportOnline } from '@/lib/offline/connectivity';
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
