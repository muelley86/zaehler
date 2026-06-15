/**
 * Tests für die zugeordneten Messstellen einer Stammdaten-Detailseite:
 * Liste mit aktuellem Stand, Empty-State, Link zur Messstellen-Detailseite.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

function _state(mp: MeasuringPointRead): MeasuringPointWithStateRead {
  return { measuring_point: mp, registers: [] };
}

function _mockResource(path: string, items: MeasuringPointWithStateRead[]) {
  server.use(http.get(`/api/v1/${path}`, () => HttpResponse.json(items)));
}

describe('RelatedMeasuringPoints — Filter', () => {
  it('filtert nach Typ und stellt mit „Filter zurücksetzen" wieder her', async () => {
    _mockResource('owners/7/measuring-points', [
      _state(_mp({ id: 42, name: 'Strom-MP', type: 'electricity' })),
      _state(_mp({ id: 43, name: 'Wasser-MP', type: 'water' })),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<RelatedMeasuringPoints resource="owners" id={7} />);

    expect(await screen.findByText('Strom-MP')).toBeInTheDocument();
    expect(screen.getByText('Wasser-MP')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Typ' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    expect(screen.getByText('Wasser-MP')).toBeInTheDocument();
    expect(screen.queryByText('Strom-MP')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getByText('Strom-MP')).toBeInTheDocument();
    expect(screen.getByText('Wasser-MP')).toBeInTheDocument();
  });

  it('blendet auf der Eigentümer-Seite den Eigentümer-Filter aus', async () => {
    // Zwei verschiedene Eigentümer (würde sonst das Dropdown zeigen), gleicher
    // Typ (kein Typ-Filter) → die einzige Multi-Wert-Dimension ist ausgeschlossen.
    _mockResource('owners/7/measuring-points', [
      _state(_mp({ id: 42, name: 'MP-A', current_owner_id: 1, current_owner_name: 'Eigt A' })),
      _state(_mp({ id: 43, name: 'MP-B', current_owner_id: 2, current_owner_name: 'Eigt B' })),
    ]);
    renderWithRouter(<RelatedMeasuringPoints resource="owners" id={7} />);

    await screen.findByText('MP-A');
    expect(screen.queryByRole('button', { name: 'Eigentümer' })).not.toBeInTheDocument();
  });

  it('blendet auf der Hauptstandort-Seite den Hauptstandort-Filter aus', async () => {
    _mockResource('main-locations/5/measuring-points', [
      _state(_mp({ id: 42, name: 'MP-A', main_location_id: 5, main_location_name: 'HS 5' })),
      _state(_mp({ id: 43, name: 'MP-B', main_location_id: 6, main_location_name: 'HS 6' })),
    ]);
    renderWithRouter(<RelatedMeasuringPoints resource="main-locations" id={5} />);

    await screen.findByText('MP-A');
    expect(screen.queryByRole('button', { name: 'Hauptstandort' })).not.toBeInTheDocument();
  });
});
