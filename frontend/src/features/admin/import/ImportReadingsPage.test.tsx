/**
 * Tests für die Import-UI: Upload -> Preview rendert das Mapping mit
 * vor-gematchter Messstelle und automatisch gesetztem Einzel-Register;
 * Commit schickt nur zugeordnete Zeilen und zeigt die Summary.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { id: 1, username: 'admin', role: 'admin', is_active: true } }),
}));

import { ImportReadingsPage } from './ImportReadingsPage';

const _waterMp: MeasuringPointRead = {
  id: 7,
  name: 'Hauptzähler Wasser',
  type: 'water',
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
  kostenstelle: null,
  physical_meters: [
    {
      id: 70,
      serial_number: 'W-1',
      installed_at: '2023-12-01',
      removed_at: null,
      registers: [
        {
          id: 700,
          obis_code: 'water',
          label: 'Verbrauch',
          unit: 'm³',
          is_active: true,
          max_value: '0',
          accepts_deliveries: false,
        },
      ],
    },
  ],
};

const _preview = {
  reading_dates: ['2024-01-31', '2024-02-29'],
  ignored_columns: [],
  rows: [
    {
      index: 1,
      raw_name: 'Hauptzähler Wasser',
      matched_mp_id: 7,
      cells: [
        { reading_date: '2024-01-31', raw: '100', value: '100', error: null },
        { reading_date: '2024-02-29', raw: '150', value: '150', error: null },
      ],
    },
    {
      index: 2,
      raw_name: 'Unbekannt',
      matched_mp_id: null,
      cells: [{ reading_date: '2024-01-31', raw: '5', value: '5', error: null }],
    },
  ],
};

function _mockPreviewAndMps() {
  server.use(
    http.post('/api/v1/imports/readings/preview', () => HttpResponse.json(_preview)),
    http.get('/api/v1/measuring-points', () => HttpResponse.json([_waterMp])),
  );
}

async function _uploadFile() {
  const user = userEvent.setup();
  renderWithRouter(<ImportReadingsPage />, { initialEntries: ['/admin/import'] });
  const input = screen.getByLabelText('Datei wählen');
  const file = new File(['x'], 'stände.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await user.upload(input, file);
  return user;
}

describe('ImportReadingsPage', () => {
  it('rendert nach Upload das Mapping mit vor-gematchter MP + Einzel-Register', async () => {
    _mockPreviewAndMps();
    await _uploadFile();

    // Mapping erschienen: zwei Zeilen -> zwei Messstellen-Selects.
    const mpSelects = await screen.findAllByLabelText<HTMLSelectElement>('Messstelle');
    expect(mpSelects).toHaveLength(2);
    expect(screen.getByText('Unbekannt')).toBeInTheDocument();

    // MP der ersten Zeile ist vorausgewählt (matched_mp_id=7), Register auto.
    expect(mpSelects[0]!.value).toBe('7');
    const regSelects = screen.getAllByLabelText<HTMLSelectElement>('Register');
    expect(regSelects[0]!.value).toBe('700'); // einziges aktives Register -> gesetzt

    // Nicht gematchte Zeile: keine MP gewählt.
    expect(mpSelects[1]!.value).toBe('');
  });

  it('committet nur zugeordnete Zeilen und zeigt die Summary', async () => {
    _mockPreviewAndMps();
    let captured: unknown = null;
    server.use(
      http.post('/api/v1/imports/readings/commit', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ created: 2, skipped_existing: 0, failed: [] });
      }),
    );
    const user = await _uploadFile();

    await user.click(await screen.findByRole('button', { name: /importieren/i }));

    expect(await screen.findByText(/Import abgeschlossen/)).toBeInTheDocument();
    expect(screen.getByText(/2 angelegt/)).toBeInTheDocument();

    // Nur die gematchte Zeile (Register 700) ist im Payload, nicht "Unbekannt".
    const body = captured as { rows: { register_id: number; cells: unknown[] }[] };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]!.register_id).toBe(700);
    expect(body.rows[0]!.cells).toHaveLength(2);
  });

  it('zeigt einen Fehler, wenn die Datei nicht gelesen werden kann', async () => {
    server.use(
      http.post('/api/v1/imports/readings/preview', () =>
        HttpResponse.json(
          { title: 'Datei konnte nicht gelesen werden', status: 400, detail: 'kaputt' },
          { status: 400 },
        ),
      ),
      http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
    );
    await _uploadFile();
    expect(await screen.findByText('kaputt')).toBeInTheDocument();
  });
});
