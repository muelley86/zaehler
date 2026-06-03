/**
 * Test für den Hauptstandort-Filter der Zählerstandorte-Admin-Liste.
 *
 * Pills werden dynamisch aus den vorkommenden Hauptstandorten abgeleitet,
 * plus „ohne Hauptstandort" für nicht zugeordnete Standorte. Mehrfach-Auswahl
 * (Union), „Zurücksetzen" hebt den Filter auf.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { LocationsAdminPage } from './LocationsAdminPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function _loc(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: 'Standort',
    note: null,
    latitude: null,
    longitude: null,
    address_street: null,
    address_postcode: null,
    address_city: null,
    main_location_id: null,
    main_location_name: null,
    ...overrides,
  };
}

function _mockList(locs: ReturnType<typeof _loc>[]) {
  server.use(
    http.get('/api/v1/locations', () => HttpResponse.json(locs)),
    http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
    http.get('/api/v1/main-locations', () => HttpResponse.json([])),
  );
}

describe('LocationsAdminPage — Hauptstandort-Filter', () => {
  it('filtert das Grid per Hauptstandort-Pill und setzt zurück', async () => {
    _mockList([
      _loc({ id: 1, name: 'Keller', main_location_id: 10, main_location_name: 'Haus West' }),
      _loc({ id: 2, name: 'Garage', main_location_id: 20, main_location_name: 'Haus Ost' }),
      _loc({ id: 3, name: 'Wiese' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<LocationsAdminPage />);

    // Alle drei Cards initial sichtbar
    expect(await screen.findByText('Keller')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Wiese')).toBeInTheDocument();

    // Hauptstandort-Dropdown öffnen, "Haus West" ankreuzen → nur Keller bleibt
    await user.click(screen.getByRole('button', { name: 'Hauptstandort' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Haus West' }));
    expect(screen.getByText('Keller')).toBeInTheDocument();
    expect(screen.queryByText('Garage')).not.toBeInTheDocument();
    expect(screen.queryByText('Wiese')).not.toBeInTheDocument();

    // "Haus West" wieder abwählen → wieder alle drei
    await user.click(screen.getByRole('checkbox', { name: 'Haus West' }));
    expect(screen.getByText('Keller')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Wiese')).toBeInTheDocument();

    // "ohne Hauptstandort" ankreuzen → nur Wiese
    await user.click(screen.getByRole('checkbox', { name: 'ohne Hauptstandort' }));
    expect(screen.getByText('Wiese')).toBeInTheDocument();
    expect(screen.queryByText('Keller')).not.toBeInTheDocument();
    expect(screen.queryByText('Garage')).not.toBeInTheDocument();
  });
});
