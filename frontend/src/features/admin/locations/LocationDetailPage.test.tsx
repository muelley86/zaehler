/**
 * Integrationstest der Zählerstandort-Detailseite: Stammdaten-Card (Adresse,
 * Hauptstandort, Koordinaten) + zugeordnete Messstellen inkl. aktuellem Stand.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { LocationRead } from '@/lib/types';

import { LocationDetailPage } from './LocationDetailPage';

const LOCATION: LocationRead = {
  id: 1,
  name: 'Keller',
  note: 'Hinter der Heizung',
  latitude: 48.137154,
  longitude: 11.575492,
  address_street: 'Hauptstr. 5',
  address_postcode: '12345',
  address_city: 'Beispielstadt',
  main_location_id: 10,
  main_location_name: 'Hauptgebäude',
};

function mpWithState() {
  return {
    measuring_point: {
      id: 42,
      name: 'Wasser-Keller',
      type: 'water',
      location_id: 1,
      location_name: 'Keller',
      main_location_id: 10,
      main_location_name: 'Hauptgebäude',
      is_bidirectional: false,
      has_dual_tariff: false,
      tank_capacity: null,
      transformer_factor: null,
      heating_source: null,
      contract_number: null,
      market_location: null,
      installation_location: null,
      current_owner_id: null,
      current_owner_name: null,
      current_supplier_id: null,
      current_supplier_name: null,
      current_mieter_id: null,
      current_mieter_name: null,
      kostenstelle: null,
      physical_meters: [],
    },
    registers: [
      {
        register_id: 7,
        physical_meter_id: 3,
        obis_code: 'water',
        label: 'Wasser',
        unit: 'm³',
        is_active: true,
        accepts_deliveries: false,
        last_reading_at: '2025-01-01T12:00:00Z',
        last_reading_value: '123.5',
        refilled_since: '0',
        current_value: '123.5',
      },
    ],
  };
}

function renderPage() {
  return renderWithRouter(
    <Routes>
      <Route path="/admin/standorte/:id" element={<LocationDetailPage />} />
    </Routes>,
    { initialEntries: ['/admin/standorte/1'] },
  );
}

describe('LocationDetailPage', () => {
  it('rendert Stammdaten und die zugeordneten Messstellen mit aktuellem Stand', async () => {
    server.use(
      http.get('/api/v1/locations/1', () => HttpResponse.json(LOCATION)),
      http.get('/api/v1/locations/1/measuring-points', () => HttpResponse.json([mpWithState()])),
    );

    renderPage();

    // Titel aus dem Standort-Namen.
    expect(await screen.findByRole('heading', { name: 'Keller' })).toBeInTheDocument();
    // Stammdaten-Felder.
    expect(screen.getByText('Hauptgebäude')).toBeInTheDocument();
    expect(screen.getByText('Hauptstr. 5, 12345 Beispielstadt')).toBeInTheDocument();
    expect(screen.getByText('48.137154, 11.575492')).toBeInTheDocument();
    // Zugeordnete Messstelle + Register-Label.
    expect(await screen.findByText('Wasser-Keller')).toBeInTheDocument();
    expect(screen.getByText('Wasser')).toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Messstellen zugeordnet sind', async () => {
    server.use(
      http.get('/api/v1/locations/1', () => HttpResponse.json(LOCATION)),
      http.get('/api/v1/locations/1/measuring-points', () => HttpResponse.json([])),
    );

    renderPage();

    expect(await screen.findByText('Keine Messstellen zugeordnet.')).toBeInTheDocument();
  });
});
