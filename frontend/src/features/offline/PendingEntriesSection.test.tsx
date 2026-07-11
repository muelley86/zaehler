import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetOfflineDbForTests } from '@/lib/offline/db';
import { enqueueGroup } from '@/lib/offline/outbox';
import { renderWithRouter } from '@/tests/render';
import { PendingEntriesSection } from './PendingEntriesSection';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const READING = {
  registerId: 12,
  mpName: 'Hauptzähler Strom',
  registerLabel: 'Bezug',
  registerUnit: 'kWh',
  obisCode: '1.8.0',
  value: '12345.6',
  readingAt: '2026-07-11T18:00:00Z',
  note: null,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
});

describe('PendingEntriesSection', () => {
  it('zeigt offene Offline-Einträge mit Wert und Status, verlinkt auf /sync', async () => {
    await enqueueGroup({ userId: 1, readings: [READING], photos: [] });

    renderWithRouter(<PendingEntriesSection />);

    const section = await screen.findByTestId('pending-entries');
    expect(section).toHaveTextContent('Hauptzähler Strom · Bezug');
    expect(section).toHaveTextContent('12.345,6 kWh');
    expect(section).toHaveTextContent('Wartet');
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/sync');
  });

  it('rendert ohne offene Einträge nichts', async () => {
    renderWithRouter(<PendingEntriesSection />);
    await waitFor(() => expect(screen.queryByTestId('pending-entries')).not.toBeInTheDocument());
  });

  it('zeigt Einträge fremder User nicht', async () => {
    await enqueueGroup({ userId: 99, readings: [READING], photos: [] });
    renderWithRouter(<PendingEntriesSection />);
    await waitFor(() => expect(screen.queryByTestId('pending-entries')).not.toBeInTheDocument());
  });
});
