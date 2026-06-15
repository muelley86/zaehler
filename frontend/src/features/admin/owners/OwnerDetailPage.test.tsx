/**
 * Integrationstest der Eigentümer-Detailseite: Stammdaten-Card + zugeordnete
 * Messstellen werden gerendert; Route-Param wird aufgelöst.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { OwnerRead } from '@/lib/types';

import { OwnerDetailPage } from './OwnerDetailPage';

const OWNER: OwnerRead = {
  id: 1,
  name: 'Mustermann GmbH',
  address_street: 'Hauptstr. 5',
  address_postcode: '12345',
  address_city: 'Beispielstadt',
  email: 'kontakt@example.com',
  phone: null,
  vat_id: 'DE123456789',
  tax_id: null,
  note: null,
};

function renderPage() {
  return renderWithRouter(
    <Routes>
      <Route path="/admin/eigentuemer/:id" element={<OwnerDetailPage />} />
    </Routes>,
    { initialEntries: ['/admin/eigentuemer/1'] },
  );
}

describe('OwnerDetailPage', () => {
  it('rendert Stammdaten und die zugeordneten Messstellen', async () => {
    server.use(
      http.get('/api/v1/owners/1', () => HttpResponse.json(OWNER)),
      http.get('/api/v1/owners/1/measuring-points', () =>
        HttpResponse.json([
          {
            measuring_point: {
              id: 42,
              name: 'Hauptzähler Strom',
              type: 'electricity',
              location_id: null,
              location_name: null,
              main_location_id: null,
              main_location_name: null,
              is_bidirectional: false,
              has_dual_tariff: false,
              tank_capacity: null,
              transformer_factor: null,
              heating_source: null,
              contract_number: null,
              market_location: null,
              installation_location: null,
              current_owner_id: 1,
              current_owner_name: 'Mustermann GmbH',
              current_supplier_id: null,
              current_supplier_name: null,
              current_mieter_id: null,
              current_mieter_name: null,
              kostenstelle: null,
              physical_meters: [],
            },
            registers: [],
          },
        ]),
      ),
    );

    renderPage();

    // Titel aus dem Eigentümer-Namen.
    expect(await screen.findByRole('heading', { name: 'Mustermann GmbH' })).toBeInTheDocument();
    // Stammdaten-Felder (Adresse zusammengesetzt, USt-IdNr.).
    expect(screen.getByText('Hauptstr. 5, 12345 Beispielstadt')).toBeInTheDocument();
    expect(screen.getByText('DE123456789')).toBeInTheDocument();
    // Zugeordnete Messstelle.
    expect(await screen.findByText('Hauptzähler Strom')).toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Messstellen zugeordnet sind', async () => {
    server.use(
      http.get('/api/v1/owners/1', () => HttpResponse.json(OWNER)),
      http.get('/api/v1/owners/1/measuring-points', () => HttpResponse.json([])),
    );

    renderPage();

    expect(await screen.findByText('Keine Messstellen zugeordnet.')).toBeInTheDocument();
  });
});
