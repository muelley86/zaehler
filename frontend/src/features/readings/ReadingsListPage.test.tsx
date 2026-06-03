/**
 * Tests für das Mehrfach-Löschen auf der Erfassungs-Liste.
 *
 * Abgedeckt:
 * 1. „Auswählen" blendet Checkboxen ein; einzelnes Markieren + „Löschen"
 *    schickt POST /readings/bulk-delete mit genau der markierten ID.
 * 2. „Alle auswählen" markiert alle löschbaren Einträge und sendet alle IDs.
 * 3. Vor dem Löschen wird window.confirm gefragt; bei Ablehnung kein Request.
 *
 * Hinweis zur AbortSignal-Umgehung: Die Liste lädt Readings/Lieferungen mit
 * einem AbortSignal (Cancel bei Filterwechsel). Unter jsdom akzeptiert Nodes
 * undici-`fetch` (von MSW genutzt) jsdoms AbortSignal-Instanz nicht. Wir
 * strippen das Signal daher pro Test über einen `api.get`-Spy — fürs
 * Lösch-Verhalten irrelevant.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import { api } from '@/lib/api';
import { formatDateTimeDe } from '@/lib/format';

import { ReadingsListPage } from './ReadingsListPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const _MP = {
  id: 1,
  name: 'Strom Hauptzähler',
  type: 'electricity',
  location_id: null,
  location_name: null,
  main_location_id: null,
  main_location_name: null,
  contract_number: null,
  market_location: null,
  installation_location: null,
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
      registers: [
        {
          id: 100,
          obis_code: '1.8.0',
          label: 'Bezug',
          unit: 'kWh',
          is_active: true,
          max_value: '0',
          accepts_deliveries: false,
        },
      ],
    },
  ],
};

function _reading(id: number, value: string, at: string) {
  return {
    id,
    register_id: 100,
    value,
    reading_at: at,
    note: null,
    created_at: '2025-05-01T10:00:00Z',
    created_by_user_id: 1,
    created_by_username: 'admin',
    has_photo: false,
    photos: [],
  };
}

let bulkBody: { ids: number[] } | null;

function _mockEndpoints(initial: ReturnType<typeof _reading>[]) {
  let current = [...initial];
  bulkBody = null;
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([_MP])),
    http.get('/api/v1/readings', () => HttpResponse.json(current)),
    http.get('/api/v1/deliveries', () => HttpResponse.json([])),
    http.post('/api/v1/readings/bulk-delete', async ({ request }) => {
      const body = (await request.json()) as { ids: number[] };
      bulkBody = body;
      current = current.filter((r) => !body.ids.includes(r.id));
      return HttpResponse.json({ deleted: body.ids.length, skipped: [] });
    }),
  );
}

describe('ReadingsListPage — Mehrfach-Löschen', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    // AbortSignal unter jsdom strippen (siehe Datei-Kommentar).
    const realGet = api.get;
    vi.spyOn(api, 'get').mockImplementation(<T,>(path: string): Promise<T> => realGet<T>(path));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function enterSelectMode(user: ReturnType<typeof userEvent.setup>) {
    const selectBtn = await screen.findByRole('button', { name: 'Auswählen' });
    await waitFor(() => expect(selectBtn).toBeEnabled());
    await user.click(selectBtn);
  }

  it('löscht einen einzeln markierten Datensatz per Bulk-Endpoint', async () => {
    _mockEndpoints([
      _reading(501, '120', '2025-05-01T12:00:00'),
      _reading(502, '130', '2025-05-02T12:00:00'),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<ReadingsListPage />);

    await enterSelectMode(user);
    const label501 = `Erfassung Strom Hauptzähler 1.8.0 vom ${formatDateTimeDe('2025-05-01T12:00:00')} auswählen`;
    await user.click(await screen.findByLabelText(label501));
    await user.click(screen.getByRole('button', { name: /Löschen \(1\)/ }));

    await waitFor(() => expect(bulkBody).not.toBeNull());
    expect(bulkBody).toEqual({ ids: [501] });
    expect(window.confirm).toHaveBeenCalledOnce();
  });

  it('"Alle auswählen" sendet alle löschbaren IDs', async () => {
    _mockEndpoints([
      _reading(501, '120', '2025-05-01T12:00:00'),
      _reading(502, '130', '2025-05-02T12:00:00'),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<ReadingsListPage />);

    await enterSelectMode(user);
    await user.click(await screen.findByRole('button', { name: 'Alle auswählen' }));
    await user.click(screen.getByRole('button', { name: /Löschen \(2\)/ }));

    await waitFor(() => expect(bulkBody).not.toBeNull());
    expect(new Set(bulkBody!.ids)).toEqual(new Set([501, 502]));
  });

  it('bei Abbruch der Rückfrage wird nichts gelöscht', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    _mockEndpoints([_reading(501, '120', '2025-05-01T12:00:00')]);
    const user = userEvent.setup();
    renderWithRouter(<ReadingsListPage />);

    await enterSelectMode(user);
    const label501 = `Erfassung Strom Hauptzähler 1.8.0 vom ${formatDateTimeDe('2025-05-01T12:00:00')} auswählen`;
    await user.click(await screen.findByLabelText(label501));
    await user.click(screen.getByRole('button', { name: /Löschen \(1\)/ }));

    expect(bulkBody).toBeNull();
  });

  it('filtert die Liste über das Zählerart-Dropdown', async () => {
    _mockEndpoints([_reading(501, '120', '2025-05-01T12:00:00')]);
    const user = userEvent.setup();
    renderWithRouter(<ReadingsListPage />);

    // Die Strom-Erfassung ist initial sichtbar.
    expect(await screen.findByText('Strom Hauptzähler')).toBeInTheDocument();

    // Zählerart-Dropdown öffnen, "Wasser" wählen → Strom-Erfassung fällt raus.
    await user.click(screen.getByRole('button', { name: 'Zählerart' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(screen.getByText('Keine Treffer.')).toBeInTheDocument();
    expect(screen.queryByText('Strom Hauptzähler')).not.toBeInTheDocument();
  });

  it('zeigt standardmäßig 50 Treffer und blättert auf alle', async () => {
    const many = Array.from({ length: 60 }, (_, i) => {
      const month = i < 28 ? '01' : i < 56 ? '02' : '03';
      const day = String((i % 28) + 1).padStart(2, '0');
      return _reading(1000 + i, String(100 + i), `2025-${month}-${day}T12:00:00`);
    });
    _mockEndpoints(many);
    const user = userEvent.setup();
    renderWithRouter(<ReadingsListPage />);

    // Standardmäßig 50 von 60 sichtbar + Blättern-Steuerung.
    expect(await screen.findByText(/50 von 60 angezeigt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weitere 50 anzeigen' })).toBeInTheDocument();

    // Alle anzeigen → Blättern-Steuerung verschwindet.
    await user.click(screen.getByRole('button', { name: /Alle anzeigen \(60\)/ }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Weitere 50 anzeigen' })).toBeNull(),
    );
  });
});
