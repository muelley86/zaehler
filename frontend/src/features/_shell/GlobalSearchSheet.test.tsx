/**
 * Globale Suche: Treffer ab Mindestlänge, Verwerfen alter Treffer beim
 * Kürzen der Eingabe und leeres Feld nach Schließen + erneutem Öffnen.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { SearchHit } from '@/lib/types';

import { GlobalSearchSheet } from './GlobalSearchSheet';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const HIT: SearchHit = {
  measuring_point_id: 7,
  measuring_point_name: 'Strom Halle',
  location_id: null,
  location_name: null,
  main_location_id: null,
  main_location_name: 'Hof',
  matched_via: 'serial',
  matched_detail: 'Z-4711',
};

function mockSearch() {
  server.use(http.get('/api/v1/search', () => HttpResponse.json([HIT])));
}

describe('GlobalSearchSheet', () => {
  it('zeigt Treffer ab der Mindestlänge und verwirft sie beim Kürzen', async () => {
    mockSearch();
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearchSheet open onClose={() => {}} />);

    const input = screen.getByLabelText('Suchbegriff');
    // Erst tippen, wenn der verzögerte Autofokus (50 ms) gesetzt ist — sonst
    // setzt er unter Last mitten im Tippen die Auswahl zurück.
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'Z-47');
    expect(await screen.findByText('Strom Halle', {}, { timeout: 3000 })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'Z');
    expect(screen.queryByText('Strom Halle')).not.toBeInTheDocument();
    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeInTheDocument();
  });

  it('startet nach Schließen und erneutem Öffnen mit leerem Feld', async () => {
    mockSearch();
    const user = userEvent.setup();
    const { rerender } = renderWithRouter(<GlobalSearchSheet open onClose={() => {}} />);

    const input = screen.getByLabelText('Suchbegriff');
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'Z-47');
    expect(await screen.findByText('Strom Halle', {}, { timeout: 3000 })).toBeInTheDocument();

    rerender(<GlobalSearchSheet open={false} onClose={() => {}} />);
    rerender(<GlobalSearchSheet open onClose={() => {}} />);

    expect(screen.getByLabelText('Suchbegriff')).toHaveValue('');
    expect(screen.queryByText('Strom Halle')).not.toBeInTheDocument();
  });
});
