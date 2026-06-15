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
    first_name: null,
    last_name: 'Mieter',
    display_name: 'Mieter',
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
  it('listet Mieter kompakt mit Anzeigename und Messstellen-Anzahl', async () => {
    _mock([
      _mieter({
        id: 1,
        first_name: 'Erika',
        last_name: 'Mustermann',
        display_name: 'Mustermann, Erika',
        address_street: 'Mietweg 2',
        address_postcode: '12345',
        address_city: 'Beispielstadt',
        email: 'erika@example.com',
      }),
      _mieter({ id: 2, last_name: 'Beispiel', display_name: 'Beispiel' }),
    ]);
    renderWithRouter(<MietersAdminPage />);
    expect(await screen.findByText('Mustermann, Erika')).toBeInTheDocument();
    expect(screen.getByText('Beispiel')).toBeInTheDocument();
    // Kompakt: Anzahl-Sublabel ist sichtbar, Adresse/Kontakt nur noch im Bearbeiten-Dialog.
    expect(screen.getAllByText('Keine Messstellen')).toHaveLength(2);
    expect(screen.queryByText(/Mietweg 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/erika@example\.com/)).not.toBeInTheDocument();
  });

  it('filtert die Liste über das Suchfeld', async () => {
    _mock([
      _mieter({ id: 1, last_name: 'Mustermann', display_name: 'Mustermann, Erika' }),
      _mieter({ id: 2, last_name: 'Beispiel', display_name: 'Beispiel' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MietersAdminPage />);

    await screen.findByText('Mustermann, Erika');
    await user.type(screen.getByLabelText('Suchen'), 'beispiel');
    expect(screen.getByText('Beispiel')).toBeInTheDocument();
    expect(screen.queryByText('Mustermann, Erika')).not.toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Mieter existieren', async () => {
    _mock([]);
    renderWithRouter(<MietersAdminPage />);
    expect(await screen.findByText('Noch keine Mieter')).toBeInTheDocument();
  });

  it('legt einen Mieter per POST an (Vorname optional, Nachname Pflicht)', async () => {
    _mock([]);
    let postBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/mieters', async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(_mieter({ id: 5, first_name: 'Neuer', last_name: 'Mieter' }), {
          status: 201,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<MietersAdminPage />);

    await user.type(await screen.findByLabelText('Vorname (optional)'), 'Neuer');
    await user.type(screen.getByLabelText('Nachname'), 'Mieter');
    await user.type(screen.getByLabelText('E-Mail'), 'info@example.com');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody!['first_name']).toBe('Neuer');
    expect(postBody!['last_name']).toBe('Mieter');
    expect(postBody!['email']).toBe('info@example.com');
    // Leere optionale Felder werden als null gesendet.
    expect(postBody!['address_street']).toBeNull();
  });

  it('löscht einen Mieter nach Bestätigung per DELETE', async () => {
    _mock([_mieter({ id: 3, last_name: 'Alt-Mieter', display_name: 'Alt-Mieter' })]);
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
    await user.click(screen.getByRole('button', { name: /löschen/i }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
