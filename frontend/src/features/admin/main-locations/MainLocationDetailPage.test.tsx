/**
 * Integrationstest der Hauptstandort-Detailseite: Stammdaten (Notiz) + die über
 * alle untergeordneten Zählerstandorte aggregierten Messstellen.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MainLocationRead } from '@/lib/types';

import { MainLocationDetailPage } from './MainLocationDetailPage';

const MAIN: MainLocationRead = {
  id: 5,
  name: 'Hauptgebäude',
  note: 'Verwaltungstrakt',
};

function mp(id: number, name: string, locationName: string) {
  return {
    measuring_point: {
      id,
      name,
      type: 'water',
      location_id: 1,
      location_name: locationName,
      main_location_id: 5,
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
    registers: [],
  };
}

function renderPage() {
  return renderWithRouter(
    <Routes>
      <Route path="/admin/hauptstandorte/:id" element={<MainLocationDetailPage />} />
    </Routes>,
    { initialEntries: ['/admin/hauptstandorte/5'] },
  );
}

describe('MainLocationDetailPage', () => {
  it('rendert die aggregierten Messstellen über mehrere Zählerstandorte', async () => {
    server.use(
      http.get('/api/v1/main-locations/5', () => HttpResponse.json(MAIN)),
      http.get('/api/v1/main-locations/5/measuring-points', () =>
        HttpResponse.json([mp(1, 'MP-Keller', 'Keller'), mp(2, 'MP-Dach', 'Dachgeschoss')]),
      ),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Hauptgebäude' })).toBeInTheDocument();
    expect(screen.getByText('Verwaltungstrakt')).toBeInTheDocument();
    // Beide MPs aus unterschiedlichen Zählerstandorten erscheinen.
    expect(await screen.findByText('MP-Keller')).toBeInTheDocument();
    expect(screen.getByText('MP-Dach')).toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Messstellen zugeordnet sind', async () => {
    server.use(
      http.get('/api/v1/main-locations/5', () => HttpResponse.json(MAIN)),
      http.get('/api/v1/main-locations/5/measuring-points', () => HttpResponse.json([])),
    );

    renderPage();

    expect(await screen.findByText('Keine Messstellen zugeordnet.')).toBeInTheDocument();
  });
});
