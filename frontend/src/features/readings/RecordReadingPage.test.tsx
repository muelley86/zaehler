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
import { useNavigate } from 'react-router-dom';

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

  it('wählt MP aus URL-Param ?mp= vor (QR-Scan-Deeplink)', async () => {
    _mockListEndpoints([
      _mp({ id: 1, name: 'Strom' }),
      _mp({
        id: 2,
        name: 'Wasser',
        type: 'water',
        physical_meters: [
          {
            id: 20,
            serial_number: 'W-1',
            installed_at: '2024-01-01',
            removed_at: null,
            registers: [
              { id: 200, obis_code: 'water', label: 'Wasser', unit: 'm³', ..._baseRegister },
            ],
          },
        ],
      }),
    ]);
    renderWithRouter(<RecordReadingPage />, { initialEntries: ['/erfassen?mp=2'] });
    // Register-Label aus MP 2 muss erscheinen, nicht das aus MP 1.
    expect(await screen.findByText('Wasser')).toBeInTheDocument();
    expect(screen.queryByText('Bezug')).not.toBeInTheDocument();
  });

  it('zeigt Hinweis, wenn ?mp= auf eine unbekannte ID zeigt', async () => {
    _mockListEndpoints([_mp({ id: 1, name: 'Strom' })]);
    renderWithRouter(<RecordReadingPage />, { initialEntries: ['/erfassen?mp=999'] });
    expect(await screen.findByTestId('record-param-warning')).toHaveTextContent(/999/);
    // Default-MP greift trotzdem.
    expect(screen.getByText('Bezug')).toBeInTheDocument();
  });

  // Regression: Bug "QR-Scan navigiert nicht zur richtigen MP". Ein per
  // navigate('/erfassen?mp=N') gesetzter Param muss auch dann greifen, wenn
  // bereits eine andere MP ausgewählt ist (typisch nach In-App-Scan).
  it('wechselt die MP, wenn ?mp= nachträglich per navigate gesetzt wird', async () => {
    _mockListEndpoints([
      _mp({ id: 1, name: 'Strom' }),
      _mp({
        id: 2,
        name: 'Wasser',
        type: 'water',
        physical_meters: [
          {
            id: 20,
            serial_number: 'W-1',
            installed_at: '2024-01-01',
            removed_at: null,
            registers: [
              { id: 200, obis_code: 'water', label: 'Wasser', unit: 'm³', ..._baseRegister },
            ],
          },
        ],
      }),
    ]);

    function ScanTrigger() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/erfassen?mp=2')}>
          simulate-scan
        </button>
      );
    }

    const user = userEvent.setup();
    renderWithRouter(
      <>
        <ScanTrigger />
        <RecordReadingPage />
      </>,
      { initialEntries: ['/erfassen'] },
    );

    // Default-MP (Strom) wird zuerst geladen.
    expect(await screen.findByText('Bezug')).toBeInTheDocument();
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    expect(select.value).toBe('1');

    // Scan simulieren: navigate setzt ?mp=2.
    await user.click(screen.getByRole('button', { name: 'simulate-scan' }));

    // MP 2 muss aktiv werden — Bezug-Register verschwindet, Select springt auf 2.
    await waitFor(() => expect(select.value).toBe('2'));
    expect(screen.queryByText('Bezug')).not.toBeInTheDocument();
  });
});
