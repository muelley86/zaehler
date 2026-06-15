/**
 * Test der minimalistischen Hauptstandorte-Liste (MasterDataList): pro Zeile die
 * Anzahl der zugeordneten Zählerstandorte, ganze Zeile verlinkt auf die
 * Detailseite, Bearbeiten isoliert die Navigation.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { MainLocationsAdminPage } from './MainLocationsAdminPage';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function _loc(id: number) {
  return {
    id,
    name: `Standort-${id}`,
    note: null,
    latitude: null,
    longitude: null,
    address_street: null,
    address_postcode: null,
    address_city: null,
    main_location_id: 5,
    main_location_name: 'Hauptgebaeude',
  };
}

function mockData() {
  server.use(
    http.get('/api/v1/main-locations', () =>
      HttpResponse.json([{ id: 5, name: 'Hauptgebaeude', note: null }]),
    ),
    http.get('/api/v1/locations', () => HttpResponse.json([_loc(1), _loc(2)])),
  );
}

describe('MainLocationsAdminPage — minimalistische Liste', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('zeigt je Zeile die Anzahl der Zählerstandorte und verlinkt auf die Detailseite', async () => {
    mockData();
    renderWithRouter(
      <>
        <MainLocationsAdminPage />
        <LocationProbe />
      </>,
    );

    expect(await screen.findByText('Hauptgebaeude')).toBeInTheDocument();
    expect(screen.getByText('2 Zaehlerstandorte')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/hauptstandorte/5');
  });

  it('öffnet Bearbeiten, ohne zur Detailseite zu navigieren', async () => {
    mockData();
    const user = userEvent.setup();
    renderWithRouter(
      <>
        <MainLocationsAdminPage />
        <LocationProbe />
      </>,
    );

    await screen.findByText('Hauptgebaeude');
    await user.click(screen.getByRole('button', { name: 'Hauptgebaeude bearbeiten' }));

    expect(screen.getByTestId('loc')).not.toHaveTextContent('/admin/hauptstandorte/5');
  });
});
