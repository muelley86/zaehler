/**
 * Smoke-Tests für die Lieferanten-Stammdaten-Seite: Liste rendern,
 * Anlegen (POST-Body), Löschen mit Bestätigung.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { SupplierRead } from '@/lib/types';

import { SuppliersAdminPage } from './SuppliersAdminPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function _supplier(overrides: Partial<SupplierRead>): SupplierRead {
  return {
    id: 1,
    name: 'Lieferant',
    address_street: null,
    address_postcode: null,
    address_city: null,
    email: null,
    phone: null,
    vat_id: null,
    tax_id: null,
    note: null,
    ...overrides,
  };
}

function _mock(suppliers: SupplierRead[]) {
  server.use(
    http.get('/api/v1/suppliers', () => HttpResponse.json(suppliers)),
    http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
  );
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('SuppliersAdminPage', () => {
  it('listet Lieferanten kompakt mit Name und Messstellen-Anzahl', async () => {
    _mock([
      _supplier({
        id: 1,
        name: 'Stadtwerke Beispielstadt',
        address_street: 'Werkstr. 1',
        address_postcode: '12345',
        address_city: 'Beispielstadt',
        email: 'service@example.com',
      }),
      _supplier({ id: 2, name: 'Regionalwerk' }),
    ]);
    renderWithRouter(<SuppliersAdminPage />);
    expect(await screen.findByText('Stadtwerke Beispielstadt')).toBeInTheDocument();
    expect(screen.getByText('Regionalwerk')).toBeInTheDocument();
    // Kompakt: Anzahl-Sublabel sichtbar, Adresse/Kontakt nur noch im Bearbeiten-Dialog.
    expect(screen.getAllByText('Keine Messstellen')).toHaveLength(2);
    expect(screen.queryByText(/Werkstr\. 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/service@example\.com/)).not.toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Lieferanten existieren', async () => {
    _mock([]);
    renderWithRouter(<SuppliersAdminPage />);
    expect(await screen.findByText('Noch keine Lieferanten')).toBeInTheDocument();
  });

  it('legt einen Lieferanten per POST an', async () => {
    _mock([]);
    let postBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/suppliers', async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(_supplier({ id: 5, name: 'Neuer Versorger' }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<SuppliersAdminPage />);

    await user.type(await screen.findByLabelText('Name'), 'Neuer Versorger');
    await user.type(screen.getByLabelText('E-Mail'), 'info@example.com');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody!['name']).toBe('Neuer Versorger');
    expect(postBody!['email']).toBe('info@example.com');
    // Leere optionale Felder werden als null gesendet.
    expect(postBody!['address_street']).toBeNull();
  });

  it('löscht einen Lieferanten nach Bestätigung per DELETE', async () => {
    _mock([_supplier({ id: 3, name: 'Alt-Versorger' })]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    server.use(
      http.delete('/api/v1/suppliers/3', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<SuppliersAdminPage />);

    await screen.findByText('Alt-Versorger');
    await user.click(screen.getByRole('button', { name: /löschen/i }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
