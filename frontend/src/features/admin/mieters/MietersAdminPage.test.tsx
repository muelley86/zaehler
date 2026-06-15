/**
 * Smoke-Tests für die Mieter-Stammdaten-Seite: Liste rendern,
 * Anlegen (POST-Body), Löschen mit Bestätigung.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MieterRead } from '@/lib/types';

import { MietersAdminPage } from './MietersAdminPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function _mieter(overrides: Partial<MieterRead>): MieterRead {
  return {
    id: 1,
    name: 'Mieter',
    address_street: null,
    address_postcode: null,
    address_city: null,
    email: null,
    phone: null,
    note: null,
    ...overrides,
  };
}

function _mock(mieters: MieterRead[]) {
  server.use(
    http.get('/api/v1/mieters', () => HttpResponse.json(mieters)),
    http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
  );
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('MietersAdminPage', () => {
  it('listet Mieter mit Adresse und Kontakt', async () => {
    _mock([
      _mieter({
        id: 1,
        name: 'Erika Mustermann',
        address_street: 'Mietweg 2',
        address_postcode: '12345',
        address_city: 'Beispielstadt',
        email: 'erika@example.com',
      }),
      _mieter({ id: 2, name: 'Hans Beispiel' }),
    ]);
    renderWithRouter(<MietersAdminPage />);
    expect(await screen.findByText('Erika Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Hans Beispiel')).toBeInTheDocument();
    expect(screen.getByText(/Mietweg 2, 12345, Beispielstadt/)).toBeInTheDocument();
    expect(screen.getByText(/erika@example\.com/)).toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Mieter existieren', async () => {
    _mock([]);
    renderWithRouter(<MietersAdminPage />);
    expect(await screen.findByText('Noch keine Mieter')).toBeInTheDocument();
  });

  it('legt einen Mieter per POST an', async () => {
    _mock([]);
    let postBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/mieters', async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(_mieter({ id: 5, name: 'Neuer Mieter' }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<MietersAdminPage />);

    await user.type(await screen.findByLabelText('Name'), 'Neuer Mieter');
    await user.type(screen.getByLabelText('E-Mail'), 'info@example.com');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody!['name']).toBe('Neuer Mieter');
    expect(postBody!['email']).toBe('info@example.com');
    // Leere optionale Felder werden als null gesendet.
    expect(postBody!['address_street']).toBeNull();
  });

  it('löscht einen Mieter nach Bestätigung per DELETE', async () => {
    _mock([_mieter({ id: 3, name: 'Alt-Mieter' })]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    server.use(
      http.delete('/api/v1/mieters/3', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<MietersAdminPage />);

    await screen.findByText('Alt-Mieter');
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
