/**
 * Tests für die Erfassen-Seite (MP-zentriert).
 *
 * Was abgedeckt wird:
 * 1. MP-Auswahl + Default auf erste MP mit aktiven Registern
 * 2. Stand-Modus: alle aktiven Register werden als eigene Zeile gerendert
 * 3. Wandlerfaktor-Hinweis erscheint bei MPs mit ``transformer_factor``
 * 4. Pill „Lieferung" erscheint nur bei MPs mit nachfüllbarem Register
 * 5. Submit ohne Werte → Inline-Error
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { RecordReadingPage } from './RecordReadingPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const _baseRegister = {
  is_active: true,
  max_value: '0',
  accepts_deliveries: false,
};

function _mp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'Strom Hauptzähler',
    type: 'electricity',
    location_id: null,
    location_name: 'Keller',
    is_bidirectional: false,
    has_dual_tariff: false,
    tank_capacity: null,
    transformer_factor: null,
    heating_source: null,
    physical_meters: [
      {
        id: 10,
        serial_number: 'SN-1',
        installed_at: '2024-01-01',
        removed_at: null,
        registers: [{ id: 100, obis_code: '1.8.0', label: 'Bezug', unit: 'kWh', ..._baseRegister }],
      },
    ],
    ...overrides,
  };
}

function _mockListEndpoints(mps: ReturnType<typeof _mp>[]) {
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json(mps)),
    http.get('/api/v1/measuring-points/:id/state', () => HttpResponse.json([])),
  );
}

describe('RecordReadingPage', () => {
  it('zeigt empty-state, wenn es keine aktiven Register gibt', async () => {
    _mockListEndpoints([]);
    renderWithRouter(<RecordReadingPage />);
    expect(await screen.findByText(/Keine aktiven Register/)).toBeInTheDocument();
  });

  it('rendert die erste MP als Default und zeigt jedes Register als eigene Zeile', async () => {
    _mockListEndpoints([
      _mp({
        physical_meters: [
          {
            id: 10,
            serial_number: 'SN-1',
            installed_at: '2024-01-01',
            removed_at: null,
            registers: [
              { id: 100, obis_code: '1.8.1', label: 'Bezug HT', unit: 'kWh', ..._baseRegister },
              { id: 101, obis_code: '1.8.2', label: 'Bezug NT', unit: 'kWh', ..._baseRegister },
            ],
          },
        ],
      }),
    ]);

    renderWithRouter(<RecordReadingPage />);
    expect(await screen.findByText('Bezug HT')).toBeInTheDocument();
    expect(screen.getByText('Bezug NT')).toBeInTheDocument();
  });

  it('zeigt den Wandlerfaktor-Hinweis bei MPs mit transformer_factor', async () => {
    _mockListEndpoints([_mp({ transformer_factor: 50 })]);
    renderWithRouter(<RecordReadingPage />);
    expect(await screen.findByText(/Wandlerfaktor ×50/)).toBeInTheDocument();
  });

  it('zeigt die Pill "Lieferung" nur bei nachfüllbarem Register', async () => {
    // Heizöl-MP mit Tank-Register
    const oilMP = _mp({
      id: 2,
      name: 'Heizöl',
      type: 'heating',
      heating_source: 'oil',
      transformer_factor: null,
      physical_meters: [
        {
          id: 20,
          serial_number: 'OIL-1',
          installed_at: '2024-01-01',
          removed_at: null,
          registers: [
            {
              id: 200,
              obis_code: 'heat.0',
              label: 'Tankstand',
              unit: 'L',
              ..._baseRegister,
              accepts_deliveries: true,
            },
          ],
        },
      ],
    });
    _mockListEndpoints([oilMP]);
    renderWithRouter(<RecordReadingPage />);
    // Pill „Lieferung" sichtbar
    expect(await screen.findByRole('button', { name: /^Lieferung$/i })).toBeInTheDocument();
    // Pill „Stände" auch
    expect(screen.getByRole('button', { name: /^Stände$/i })).toBeInTheDocument();
  });

  it('Submit ohne Werte zeigt Inline-Fehler', async () => {
    _mockListEndpoints([_mp()]);
    const user = userEvent.setup();
    renderWithRouter(<RecordReadingPage />);
    await screen.findByText('Bezug');
    await user.click(screen.getByRole('button', { name: /Speichern/i }));
    await waitFor(() =>
      expect(screen.getByTestId('record-error')).toHaveTextContent(/mindestens einen Wert/i),
    );
  });
});
