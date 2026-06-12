/**
 * Tests für die Detail-Seite einer verrechneten Messstelle: Komponenten-
 * Tabelle mit Vorzeichen/Richtung/Wert/Beitrag + Netto, Refetch bei
 * Datums-Änderung (from_at/to_at), Fehlerbox bei 404 (kein Zugriff).
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { formatDe } from '@/lib/format';
import type { VirtualMeasuringPointRead, VirtualMpBreakdownResponse } from '@/lib/types';

import { VirtualPointDetailPage } from './VirtualPointDetailPage';

const VMP: VirtualMeasuringPointRead = {
  id: 9,
  name: 'Biogasanlage real',
  note: 'Realverbrauch',
  type: 'electricity',
  components: [],
};

const BREAKDOWN: VirtualMpBreakdownResponse = {
  virtual_measuring_point_id: 9,
  from_date: null,
  to_date: null,
  components: [
    {
      component_id: 70,
      measuring_point_id: 1,
      measuring_point_name: 'Biogas-Trafo',
      direction: 'bezug',
      sign: 1,
      consumption: '300',
      contribution: '300',
      unit: 'kWh',
    },
    {
      component_id: 71,
      measuring_point_id: 2,
      measuring_point_name: 'Solar-Erzeugung',
      direction: 'bezug',
      sign: 1,
      consumption: '500',
      contribution: '500',
      unit: 'kWh',
    },
    {
      component_id: 72,
      measuring_point_id: 3,
      measuring_point_name: 'Solar-Trafo',
      direction: 'einspeisung',
      sign: -1,
      consumption: '420',
      contribution: '-420',
      unit: 'kWh',
    },
  ],
  totals: [{ unit: 'kWh', net: '380' }],
};

/** Registriert Metadaten + Breakdown; liefert die gesehenen Query-Strings. */
function mockEndpoints(): { breakdownQueries: string[] } {
  const breakdownQueries: string[] = [];
  server.use(
    http.get('/api/v1/virtual-measuring-points/9', () => HttpResponse.json(VMP)),
    http.get('/api/v1/virtual-measuring-points/9/breakdown', ({ request }) => {
      breakdownQueries.push(new URL(request.url).search);
      return HttpResponse.json(BREAKDOWN);
    }),
  );
  return { breakdownQueries };
}

function renderPage() {
  return renderWithRouter(
    <Routes>
      <Route path="/verrechnung/:id" element={<VirtualPointDetailPage />} />
    </Routes>,
    { initialEntries: ['/verrechnung/9'] },
  );
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('VirtualPointDetailPage', () => {
  it('zeigt Komponenten mit Vorzeichen, Richtung, Wert, Beitrag und Netto', async () => {
    mockEndpoints();
    renderPage();
    expect(await screen.findByText('Biogasanlage real (verrechnet)')).toBeInTheDocument();
    expect(screen.getByText(/Realverbrauch/)).toBeInTheDocument();
    expect(await screen.findByText('Biogas-Trafo')).toBeInTheDocument();
    expect(screen.getByText('Solar-Erzeugung')).toBeInTheDocument();
    expect(screen.getByText('Solar-Trafo')).toBeInTheDocument();
    // Richtungs-Labels (Strom-vmp): zwei Bezug, eine Einspeisung.
    expect(screen.getAllByText('Bezug')).toHaveLength(2);
    expect(screen.getByText('Einspeisung')).toBeInTheDocument();
    // Rohwert + Beitrag der Einspeise-Komponente (Vorzeichen via formatDe,
    // damit der Test nicht am Minus-Zeichen des Formatters hängt).
    expect(screen.getByText(`${formatDe('420')} kWh`)).toBeInTheDocument();
    expect(screen.getByText(`${formatDe('-420')} kWh`)).toBeInTheDocument();
    // Netto-Zeile.
    expect(screen.getByText('Netto')).toBeInTheDocument();
    expect(screen.getByText(`${formatDe('380')} kWh`)).toBeInTheDocument();
  });

  it('lädt den Breakdown bei Datums-Änderung mit from_at/to_at neu', async () => {
    const { breakdownQueries } = mockEndpoints();
    renderPage();
    await screen.findByText('Biogasanlage real (verrechnet)');
    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2025-01-10' } });
    await waitFor(() =>
      expect(
        breakdownQueries.some(
          (q) => q.includes('from_at=2025-01-01') && q.includes('to_at=2025-01-10'),
        ),
      ).toBe(true),
    );
  });

  it('zeigt bei 404 (kein Zugriff) die Fehlerbox', async () => {
    server.use(
      http.get('/api/v1/virtual-measuring-points/9', () =>
        HttpResponse.json(
          { title: 'Virtual measuring point not found', status: 404 },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
      http.get('/api/v1/virtual-measuring-points/9/breakdown', () =>
        HttpResponse.json(
          { title: 'Virtual measuring point not found', status: 404 },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    renderPage();
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
