/**
 * Tests für die zugeordneten Messstellen einer Stammdaten-Detailseite:
 * Liste mit aktuellem Stand, Empty-State, Link zur Messstellen-Detailseite.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type {
  MeasuringPointRead,
  MeasuringPointWithStateRead,
  RegisterStateRead,
} from '@/lib/types';

import { RelatedMeasuringPoints } from './RelatedMeasuringPoints';

function _mp(overrides: Partial<MeasuringPointRead>): MeasuringPointRead {
  return {
    id: 1,
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
    current_owner_id: null,
    current_owner_name: null,
    current_supplier_id: null,
    current_supplier_name: null,
    current_mieter_id: null,
    current_mieter_name: null,
    kostenstelle: null,
    physical_meters: [],
    ...overrides,
  };
}

function _register(overrides: Partial<RegisterStateRead>): RegisterStateRead {
  return {
    register_id: 1,
    physical_meter_id: 1,
    obis_code: '1.8.0',
    label: 'Bezug',
    unit: 'kWh',
    is_active: true,
    accepts_deliveries: false,
    last_reading_at: '2025-01-01T12:00:00Z',
    last_reading_value: '123.5',
    refilled_since: '0',
    current_value: '123.5',
    ...overrides,
  };
}

function _mock(items: MeasuringPointWithStateRead[]) {
  server.use(http.get('/api/v1/owners/7/measuring-points', () => HttpResponse.json(items)));
}

describe('RelatedMeasuringPoints', () => {
  it('zeigt zugeordnete Messstellen mit aktuellem Stand', async () => {
    _mock([
      { measuring_point: _mp({ id: 42, name: 'Hauptzähler Strom' }), registers: [_register({})] },
    ]);
    renderWithRouter(<RelatedMeasuringPoints resource="owners" id={7} />);

    expect(await screen.findByText('Hauptzähler Strom')).toBeInTheDocument();
    expect(screen.getByText('Bezug')).toBeInTheDocument();
    // Deutscher Dezimaltrenner + Einheit.
    expect(screen.getByText(/123,5\s*kWh/)).toBeInTheDocument();
  });

  it('verlinkt jede Messstelle auf ihre Detailseite', async () => {
    _mock([
      { measuring_point: _mp({ id: 42, name: 'Hauptzähler Strom' }), registers: [_register({})] },
    ]);
    renderWithRouter(<RelatedMeasuringPoints resource="owners" id={7} />);

    const link = await screen.findByRole('link', { name: /Hauptzähler Strom öffnen/ });
    expect(link).toHaveAttribute('href', '/admin/messstellen/42');
  });

  it('zeigt einen Empty-State, wenn keine Messstellen zugeordnet sind', async () => {
    _mock([]);
    renderWithRouter(<RelatedMeasuringPoints resource="owners" id={7} />);

    expect(await screen.findByText('Keine Messstellen zugeordnet.')).toBeInTheDocument();
  });
});
