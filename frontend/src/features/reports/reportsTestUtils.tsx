/**
 * Gemeinsame Test-Helfer für die Auswertungen-Seite: Messstellen-Fixture,
 * MSW-Endpoints mit Protokoll der Aggregat-Aufrufe und `runReport()` für den
 * expliziten „Auswerten"-Klick (die Seite lädt nicht mehr automatisch).
 */

import { http, HttpResponse } from 'msw';
import { fireEvent, screen } from '@testing-library/react';

import { server } from '@/tests/server';
import type { MeasuringPointRead, ReportAggregateResponse, ReportConfigRead } from '@/lib/types';

export const MP: MeasuringPointRead = {
  id: 1,
  name: 'Strom Halle',
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
  current_owner_id: null,
  current_owner_name: null,
  current_supplier_id: null,
  current_supplier_name: null,
  current_mieter_id: null,
  current_mieter_name: null,
  kostenstelle: 10001,
  physical_meters: [],
};

export function response(partial = false): ReportAggregateResponse {
  return {
    dimension: 'kostenstelle',
    granularity: 'total',
    from_date: null,
    to_date: null,
    partial,
    rows: [
      {
        group_key: 10001,
        group_label: '10001',
        meter_type: 'electricity',
        unit: 'kWh',
        direction: 'bezug',
        period_start: null,
        period_end: null,
        consumption: '1234',
      },
    ],
  };
}

export interface AggregateCalls {
  urls: string[];
  dimensionCalls: string[];
  dateParams: Array<{ from: string | null; to: string | null }>;
}

export interface MockEndpointOptions {
  partial?: boolean;
  configs?: ReportConfigRead[];
  /** Antwort-Body je Aggregat-Call (Default: `response()`). */
  body?: ReportAggregateResponse;
}

export function mockEndpoints(opts: MockEndpointOptions = {}): AggregateCalls {
  const calls: AggregateCalls = { urls: [], dimensionCalls: [], dateParams: [] };
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([MP])),
    http.get('/api/v1/report-configs', () => HttpResponse.json(opts.configs ?? [])),
    http.get('/api/v1/reports/aggregate', ({ request }) => {
      const sp = new URL(request.url).searchParams;
      calls.urls.push(request.url);
      const d = sp.get('dimension');
      if (d) calls.dimensionCalls.push(d);
      calls.dateParams.push({ from: sp.get('from_at'), to: sp.get('to_at') });
      // Wie das Backend: die angefragten Grenzen werden im Response geechot.
      return HttpResponse.json({
        ...(opts.body ?? response(opts.partial ?? false)),
        from_date: sp.get('from_at'),
        to_date: sp.get('to_at'),
      });
    }),
  );
  return calls;
}

/** Klickt „Auswerten" — erst danach lädt die Seite `/reports/aggregate`. */
export async function runReport(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Auswerten' }));
}
