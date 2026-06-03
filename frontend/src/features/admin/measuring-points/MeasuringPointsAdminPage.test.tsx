/**
 * Tests für den Anlage-Wizard. Wir prüfen den Fluss durch die zwei Stufen:
 *  1. Top-Level-TypePicker zeigt 3 Karten (Strom / Wasser / Heizung)
 *  2. Nach Auswahl „Heizung" erscheint der Energieträger-Sub-Picker mit 5
 *     Optionen, und die Register-Liste wird mit dem Preset des gewählten
 *     Energieträgers vorbefüllt (Heizöl: Betriebsstunden + Tankstand).
 *
 * Plus ein Smoke-Test, dass jede MP-Card zur Detail-Page verlinkt
 * (Stammdaten-Konsolidierung — alle Edits leben dort, nicht mehr inline).
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { MeasuringPointsAdminPage } from './MeasuringPointsAdminPage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function _mockEmptyData() {
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/owners', () => HttpResponse.json([])),
  );
}

function _mp(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: 'MP',
    type: 'electricity',
    heating_source: null,
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
    transformer_factor: null,
    tank_capacity: null,
    physical_meters: [],
    ...overrides,
  };
}

function _mockList(mps: ReturnType<typeof _mp>[]) {
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json(mps)),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/owners', () => HttpResponse.json([])),
  );
}

describe('MeasuringPointsAdminPage Wizard', () => {
  it('zeigt nach Klick auf "Messstelle anlegen" drei Typ-Karten', async () => {
    _mockEmptyData();
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    expect(await screen.findByText(/Welcher Messstellen-Typ\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Strom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wasser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Heizung/i })).toBeInTheDocument();
  });

  it('zeigt nach Auswahl von "Heizung" alle 5 Energieträger-Optionen', async () => {
    _mockEmptyData();
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    await user.click(await screen.findByRole('button', { name: /Heizung/i }));

    const energieSelect = screen.getByLabelText(/Energieträger/i);
    const optionTexts = Array.from((energieSelect as HTMLSelectElement).options).map(
      (o) => o.textContent,
    );
    expect(optionTexts).toEqual(
      expect.arrayContaining(['Heizöl', 'Gas', 'Hackschnitzel', 'Holz', 'Fernwärme']),
    );
  });

  it('befüllt die Register-Liste mit dem Heizöl-Preset', async () => {
    _mockEmptyData();
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    await user.click(await screen.findByRole('button', { name: /Heizung/i }));

    // Heizöl ist Default — Preset hat zwei Register: Betriebsstunden + Tankstand
    const labelInputs = await screen.findAllByLabelText('Label');
    const labels = (labelInputs as HTMLInputElement[]).map((i) => i.value);
    expect(labels).toEqual(['Betriebsstunden', 'Tankstand']);
  });

  it('wechselt das Preset, wenn der Energieträger geändert wird', async () => {
    _mockEmptyData();
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    await user.click(await screen.findByRole('button', { name: /Heizung/i }));

    // Auf Hackschnitzel wechseln
    await user.selectOptions(screen.getByLabelText(/Energieträger/i), 'wood_chips');
    const labelInputs = await screen.findAllByLabelText('Label');
    const labels = (labelInputs as HTMLInputElement[]).map((i) => i.value);
    expect(labels).toEqual(['Betriebsstunden', 'Vorrat']);
  });

  it('blendet Tankvolumen und Nachfüllbar-Schalter bei Fernwärme aus', async () => {
    _mockEmptyData();
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    await user.click(await screen.findByRole('button', { name: /Heizung/i }));

    // Heizöl (Default): Tankvolumen + Nachfüllbar sichtbar.
    expect(screen.getByLabelText(/Tankvolumen/i)).toBeInTheDocument();
    expect(screen.getAllByText('Nachfüllbar (Lieferungen)').length).toBeGreaterThan(0);

    // Auf Fernwärme wechseln: beides verschwindet.
    await user.selectOptions(screen.getByLabelText(/Energieträger/i), 'district_heat');
    expect(screen.queryByLabelText(/Tankvolumen/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Nachfüllbar (Lieferungen)')).not.toBeInTheDocument();
  });

  it('verlinkt jede MP-Card auf die Detail-Page', async () => {
    server.use(
      http.get('/api/v1/measuring-points', () =>
        HttpResponse.json([
          {
            id: 7,
            name: 'Hauptzähler Strom',
            type: 'electricity',
            heating_source: null,
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
            transformer_factor: null,
            tank_capacity: null,
            physical_meters: [],
          },
        ]),
      ),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
      http.get('/api/v1/owners', () => HttpResponse.json([])),
    );
    renderWithRouter(<MeasuringPointsAdminPage />);
    const link = await screen.findByRole('link', {
      name: /Messstelle Hauptzähler Strom öffnen/i,
    });
    expect(link).toHaveAttribute('href', '/admin/messstellen/7');
  });

  it('zeigt den Wandlerfaktor-Eingabefeld nur bei Strom', async () => {
    _mockEmptyData();
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    await user.click(await screen.findByRole('button', { name: /Strom/i }));
    expect(screen.getByLabelText(/Wandlerfaktor/i)).toBeInTheDocument();

    // Zurück und Wasser wählen — Wandlerfaktor darf nicht erscheinen
    await user.click(screen.getByText(/Typ ändern/i));
    await user.click(await screen.findByRole('button', { name: /Wasser/i }));
    const within_form = within(screen.getByRole('button', { name: /Anlegen/i }).closest('form')!);
    expect(within_form.queryByLabelText(/Wandlerfaktor/i)).not.toBeInTheDocument();
  });

  it('filtert die Liste per Typ-Pill und setzt zurück', async () => {
    _mockList([
      _mp({ id: 1, name: 'Hauptzähler Strom', type: 'electricity' }),
      _mp({ id: 2, name: 'Gartenwasser', type: 'water' }),
      _mp({ id: 3, name: 'Ölheizung', type: 'heating', heating_source: 'oil' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    // Alle drei Cards initial sichtbar
    expect(await screen.findByText('Hauptzähler Strom')).toBeInTheDocument();
    expect(screen.getByText('Gartenwasser')).toBeInTheDocument();
    expect(screen.getByText('Ölheizung')).toBeInTheDocument();

    // Auf Typ-Pill "Wasser" filtern → nur die Wasser-Card bleibt
    await user.click(screen.getByRole('button', { name: 'Wasser' }));
    expect(screen.getByText('Gartenwasser')).toBeInTheDocument();
    expect(screen.queryByText('Hauptzähler Strom')).not.toBeInTheDocument();
    expect(screen.queryByText('Ölheizung')).not.toBeInTheDocument();

    // Zurücksetzen → wieder alle drei
    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.getByText('Hauptzähler Strom')).toBeInTheDocument();
    expect(screen.getByText('Gartenwasser')).toBeInTheDocument();
    expect(screen.getByText('Ölheizung')).toBeInTheDocument();
  });
});
