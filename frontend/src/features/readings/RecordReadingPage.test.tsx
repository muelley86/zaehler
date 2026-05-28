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
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    main_location_id: null,
    main_location_name: null,
    contract_number: null,
    market_location: null,
    current_owner_id: null,
    current_owner_name: null,
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

  it('haengt ein Foto an erfolgreiche Readings an und meldet Erfolg', async () => {
    _mockListEndpoints([_mp()]);
    const photoCalls: { url: string }[] = [];
    const readingBodies: { reading_at: string }[] = [];
    server.use(
      http.post('/api/v1/readings', async ({ request }) => {
        const body = (await request.json()) as { reading_at: string };
        readingBodies.push(body);
        return HttpResponse.json(
          {
            id: 555,
            register_id: 100,
            value: '123',
            reading_at: '2025-07-01T10:00:00',
            note: null,
            created_at: '2025-07-01T10:00:00Z',
            created_by_user_id: 1,
            created_by_username: 'admin',
            has_photo: false,
          },
          { status: 201 },
        );
      }),
      http.put('/api/v1/readings/:id/photo', ({ params }) => {
        // Body nicht lesen — request.arrayBuffer()/formData() ist mit
        // FormData in jsdom flaky (haengt CI gelegentlich). Es reicht
        // zu wissen, dass der PUT mit der erwarteten ID stattfand.
        photoCalls.push({ url: String(params['id']) });
        return HttpResponse.json({
          id: Number(params['id']),
          register_id: 100,
          value: '123',
          reading_at: '2025-07-01T10:00:00',
          note: null,
          created_at: '2025-07-01T10:00:00Z',
          created_by_user_id: 1,
          created_by_username: 'admin',
          has_photo: true,
        });
      }),
    );

    const user = userEvent.setup();
    renderWithRouter(<RecordReadingPage />);
    await screen.findByText('Bezug');

    const input = screen.getByPlaceholderText(/leer = nicht erfassen/i);
    await user.type(input, '123');

    const fileInput = screen.getByTestId('record-photo-camera-input');
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'meter.jpg', {
      type: 'image/jpeg',
    });
    // fireEvent.change statt user.upload: user.upload prueft Sichtbarkeit
    // des Inputs, unser File-Input ist aber per Design "display: none".
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByAltText('Vorschau')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^Speichern$/i }));

    await waitFor(
      () => {
        const err = screen.queryByTestId('record-error');
        if (err) throw new Error(`record-error: ${err.textContent}`);
        const success = screen.queryByTestId('record-success');
        if (!success) throw new Error('still busy');
        expect(success).toHaveTextContent(/Foto angehängt/);
      },
      { timeout: 5000 },
    );
    expect(photoCalls).toEqual([{ url: '555' }]);
    // Regression: reading_at muss als aware ISO mit Z gesendet werden,
    // sonst lehnt das Backend lokale Zeiten aus Zonen oestlich von UTC
    // mit 422 ("reading_at darf nicht in der Zukunft liegen") ab.
    expect(readingBodies).toHaveLength(1);
    expect(readingBodies[0]?.reading_at).toMatch(/Z$/);
  });

  it('ruft navigator.geolocation auf, wenn ein Foto hochgeladen wird', async () => {
    _mockListEndpoints([_mp()]);
    // navigator.geolocation in jsdom mocken — wir verifizieren ueber den
    // Spy, dass die Geraete-Position-Abfrage stattfindet. Body-Inhalt der
    // Multipart-FormData parsen ist mit MSW + jsdom flaky (request.arrayBuffer
    // haengt auf CI) — der Spy beweist denselben Pfad ohne dieses Risiko.
    const getCurrentPositionMock = vi.fn(
      (success: (pos: { coords: { latitude: number; longitude: number } }) => void) => {
        success({ coords: { latitude: 48.137154, longitude: 11.576124 } });
      },
    );
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: getCurrentPositionMock },
    });

    const photoUrls: string[] = [];
    server.use(
      http.post('/api/v1/readings', () =>
        HttpResponse.json(
          {
            id: 888,
            register_id: 100,
            value: '123',
            reading_at: '2025-07-01T10:00:00',
            note: null,
            created_at: '2025-07-01T10:00:00Z',
            created_by_user_id: 1,
            created_by_username: 'admin',
            has_photo: false,
            photo_lat: null,
            photo_lon: null,
          },
          { status: 201 },
        ),
      ),
      http.put('/api/v1/readings/:id/photo', ({ params }) => {
        photoUrls.push(String(params['id']));
        return HttpResponse.json({
          id: 888,
          register_id: 100,
          value: '123',
          reading_at: '2025-07-01T10:00:00',
          note: null,
          created_at: '2025-07-01T10:00:00Z',
          created_by_user_id: 1,
          created_by_username: 'admin',
          has_photo: true,
          photo_lat: 48.137154,
          photo_lon: 11.576124,
        });
      }),
    );

    const user = userEvent.setup();
    renderWithRouter(<RecordReadingPage />);
    await screen.findByText('Bezug');
    await user.type(screen.getByPlaceholderText(/leer = nicht erfassen/i), '123');
    const fileInput = screen.getByTestId('record-photo-camera-input');
    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array([0xff])], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByAltText('Vorschau')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Speichern$/i }));

    await waitFor(() => expect(photoUrls).toEqual(['888']), { timeout: 5000 });
    expect(getCurrentPositionMock).toHaveBeenCalled();
  });

  it('zeigt eine Warnung, wenn der Foto-Upload scheitert (Reading bleibt erhalten)', async () => {
    _mockListEndpoints([_mp()]);
    server.use(
      http.post('/api/v1/readings', () =>
        HttpResponse.json(
          {
            id: 777,
            register_id: 100,
            value: '123',
            reading_at: '2025-07-01T10:00:00',
            note: null,
            created_at: '2025-07-01T10:00:00Z',
            created_by_user_id: 1,
            created_by_username: 'admin',
            has_photo: false,
          },
          { status: 201 },
        ),
      ),
      http.put('/api/v1/readings/:id/photo', () =>
        HttpResponse.json(
          { title: 'Unsupported image format', status: 415, detail: 'HEIC nicht erlaubt.' },
          { status: 415 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithRouter(<RecordReadingPage />);
    await screen.findByText('Bezug');
    await user.type(screen.getByPlaceholderText(/leer = nicht erfassen/i), '123');
    const fileInput = screen.getByTestId('record-photo-camera-input');
    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array([0])], 'x.heic', { type: 'image/heic' })] },
    });
    await waitFor(() => expect(screen.getByAltText('Vorschau')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Speichern$/i }));

    await waitFor(() =>
      expect(screen.getByTestId('record-photo-warning')).toHaveTextContent(/HEIC/),
    );
    // Reading-Erfolg trotzdem da, aber ohne "Foto angehängt".
    expect(screen.getByTestId('record-success')).toBeInTheDocument();
    expect(screen.getByTestId('record-success')).not.toHaveTextContent(/Foto angehängt/);
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
