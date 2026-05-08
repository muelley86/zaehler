/**
 * Smoke-Tests für die MP-Detail-Page nach der Stammdaten-Konsolidierung.
 *
 * Wir prüfen:
 *  - Stammdaten-Card öffnet Edit-Form via "Bearbeiten"-Knopf.
 *  - Physische-Zähler-Card listet aktive Zähler mit "aktiv"-Badge und
 *    bietet 'Zähler tauschen' an (öffnet Sheet).
 *  - Pro Register mit accepts_deliveries=true erscheint ein
 *    'Befüllungen'-Trigger.
 *  - Heizungs-MPs zeigen einen extra 'Bearbeiten'-Knopf in der
 *    Register-Section (HeatingRegisterEditor); Strom nicht.
 *
 * Mocking-Notizen:
 * - vi.mock('react-router-dom', ...) muss STABILE Referenzen zurückgeben
 *   (kein vi.fn() in der Factory) — sonst sieht React bei jedem Render
 *   neue navigate-Identity, useEffect mit [navigate] als Dep läuft endlos.
 * - LocationMapSheet (Leaflet) und QrCodeCard / MpAccessCard sind als
 *   no-op gemockt — nicht Test-Subjekt hier; QrCodeCard/MpAccessCard
 *   machen eigene API-Calls, die wir nicht abdecken müssen.
 * - vite.config.ts pool='threads' verhindert Worker-Crash unter Node 24
 *   mit Tinypool 1.1 (forks-Pool).
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  // STABILE Referenzen für useParams/useNavigate, sonst sieht React bei
  // jedem Render eine neue navigate-Identity und der useEffect mit
  // [mpId, navigate, tick] läuft endlos. Dependency-Stable-Mocks sind
  // hier kritisch.
  const stableNavigate = vi.fn();
  const stableParams = { id: '1' };
  return {
    ...actual,
    useParams: () => stableParams,
    useNavigate: () => stableNavigate,
  };
});

vi.mock('@/components/LocationMapSheet', () => ({
  LocationMapSheet: () => null,
}));

vi.mock('./QrCodeCard', () => ({
  QrCodeCard: () => null,
}));

vi.mock('./MpAccessCard', () => ({
  MpAccessCard: () => null,
}));

if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

import { MeasuringPointDetailPage } from './MeasuringPointDetailPage';

// --- Fixtures -------------------------------------------------------------

const _baseRegister = {
  is_active: true,
  max_value: '0',
  accepts_deliveries: false,
};

function _mockMp(mp: MeasuringPointRead) {
  server.use(
    http.get('/api/v1/measuring-points/1', () => HttpResponse.json(mp)),
    http.get('/api/v1/measuring-points/1/consumption', () => HttpResponse.json([])),
    http.get('/api/v1/measuring-points/1/state', () => HttpResponse.json([])),
    http.get('/api/v1/measuring-points/1/users', () => HttpResponse.json([])),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/qr-tokens', () => HttpResponse.json([])),
  );
}

const _strom: MeasuringPointRead = {
  id: 1,
  name: 'Hauptzähler Strom',
  type: 'electricity',
  heating_source: null,
  location_id: null,
  location_name: null,
  is_bidirectional: false,
  has_dual_tariff: false,
  transformer_factor: null,
  tank_capacity: null,
  physical_meters: [
    {
      id: 10,
      serial_number: 'SN-1',
      installed_at: '2025-01-15',
      removed_at: null,
      registers: [{ id: 100, obis_code: '1.8.0', label: 'Bezug', unit: 'kWh', ..._baseRegister }],
    },
  ],
};

const _heizung: MeasuringPointRead = {
  id: 1,
  name: 'Heizöl Heizung',
  type: 'heating',
  heating_source: 'oil',
  location_id: null,
  location_name: null,
  is_bidirectional: false,
  has_dual_tariff: false,
  transformer_factor: null,
  tank_capacity: '5000.0',
  physical_meters: [
    {
      id: 20,
      serial_number: 'OIL-1',
      installed_at: '2024-06-01',
      removed_at: null,
      registers: [
        {
          id: 200,
          obis_code: 'h-1',
          label: 'Tankstand',
          unit: 'L',
          ..._baseRegister,
          accepts_deliveries: true,
        },
      ],
    },
  ],
};

// --- Tests ----------------------------------------------------------------

describe('MeasuringPointDetailPage Stammdaten-Card', () => {
  it('rendert die Stammdaten-Card mit "Bearbeiten"-Knopf', async () => {
    _mockMp(_strom);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    expect(await screen.findByText(/Stammdaten/i)).toBeInTheDocument();
    const editButtons = await screen.findAllByRole('button', { name: /^Bearbeiten$/ });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('öffnet das Edit-Formular bei Klick auf "Bearbeiten"', async () => {
    _mockMp(_strom);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    // Bei Strom sind zwei "Bearbeiten"-Knöpfe da; der erste ist der von
    // der Stammdaten-Card (DOM-Order).
    const editButtons = await screen.findAllByRole('button', { name: /^Bearbeiten$/ });
    fireEvent.click(editButtons[0]!);
    // Standort-Select + Speichern + Abbrechen erscheinen im Edit-Modus.
    expect(await screen.findByLabelText(/Standort/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Speichern/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abbrechen/i })).toBeInTheDocument();
    // Wandlerfaktor erscheint nur bei Strom.
    expect(screen.getByLabelText(/Wandlerfaktor/i)).toBeInTheDocument();
  });
});

describe('MeasuringPointDetailPage Physische Zähler', () => {
  it('listet den aktiven Zähler mit "aktiv"-Badge', async () => {
    _mockMp(_strom);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    // SN-1 erscheint in der Physische-Zähler-Card UND in der Register-Tabelle.
    const sns = await screen.findAllByText(/SN SN-1/);
    expect(sns.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^aktiv$/i)).toBeInTheDocument();
  });

  it('zeigt "Zähler tauschen" wenn ein aktiver Zähler existiert', async () => {
    _mockMp(_strom);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    expect(await screen.findByRole('button', { name: /Zähler tauschen/i })).toBeInTheDocument();
  });

  it('öffnet das Tausch-Sheet bei Klick auf "Zähler tauschen"', async () => {
    _mockMp(_strom);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    fireEvent.click(await screen.findByRole('button', { name: /Zähler tauschen/i }));
    expect(await screen.findByRole('button', { name: /Tausch durchführen/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Neue Seriennummer/i)).toBeInTheDocument();
  });
});

describe('MeasuringPointDetailPage Register-Section', () => {
  it('zeigt einen "Befüllungen"-Knopf für Register mit accepts_deliveries', async () => {
    _mockMp(_heizung);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    expect(await screen.findByRole('button', { name: /Befüllungen/i })).toBeInTheDocument();
  });

  it('zeigt drei "Bearbeiten"-Knöpfe bei Heizung (Stammdaten + Zähler + Register)', async () => {
    _mockMp(_heizung);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    const editButtons = await screen.findAllByRole('button', { name: /^Bearbeiten$/ });
    // Stammdaten-Card + Physical-Meter-Row + Register-Section = 3
    expect(editButtons.length).toBe(3);
  });

  it('zeigt zwei "Bearbeiten"-Knöpfe bei Strom (kein Register-Editor)', async () => {
    _mockMp(_strom);
    renderWithRouter(<MeasuringPointDetailPage />, {
      initialEntries: ['/admin/messstellen/1'],
    });
    // Strom: Stammdaten-Card + Physical-Meter-Row = 2 (kein Register-Editor,
    // weil Strom feste OBIS-Register hat).
    const editButtons = await screen.findAllByRole('button', { name: /^Bearbeiten$/ });
    expect(editButtons.length).toBe(2);
  });
});
