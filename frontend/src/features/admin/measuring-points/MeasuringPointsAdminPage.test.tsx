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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    http.get('/api/v1/suppliers', () => HttpResponse.json([])),
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
    current_supplier_id: null,
    current_supplier_name: null,
    is_bidirectional: false,
    has_dual_tariff: false,
    transformer_factor: null,
    tank_capacity: null,
    physical_meters: [],
    ...overrides,
  };
}

function _mockList(mps: ReturnType<typeof _mp>[], suppliers: { id: number; name: string }[] = []) {
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json(mps)),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
    http.get('/api/v1/owners', () => HttpResponse.json([])),
    http.get('/api/v1/suppliers', () => HttpResponse.json(suppliers)),
  );
}

describe('MeasuringPointsAdminPage Wizard', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

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
            current_supplier_id: null,
            current_supplier_name: null,
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
      http.get('/api/v1/suppliers', () => HttpResponse.json([])),
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

  it('filtert die Liste per Typ-Dropdown und setzt zurück', async () => {
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

    // Typ-Dropdown öffnen, "Wasser" ankreuzen → nur die Wasser-Card bleibt
    await user.click(screen.getByRole('button', { name: 'Typ' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Wasser' }));
    expect(screen.getByText('Gartenwasser')).toBeInTheDocument();
    expect(screen.queryByText('Hauptzähler Strom')).not.toBeInTheDocument();
    expect(screen.queryByText('Ölheizung')).not.toBeInTheDocument();

    // "Wasser" wieder abwählen → wieder alle drei
    await user.click(screen.getByRole('checkbox', { name: 'Wasser' }));
    expect(screen.getByText('Hauptzähler Strom')).toBeInTheDocument();
    expect(screen.getByText('Gartenwasser')).toBeInTheDocument();
    expect(screen.getByText('Ölheizung')).toBeInTheDocument();
  });

  it('merkt den Typ-Filter in sessionStorage, wenn „Filter merken" aktiv ist', async () => {
    window.localStorage.setItem('filters.remember', '1');
    _mockList([
      _mp({ id: 1, name: 'Hauptzähler Strom', type: 'electricity' }),
      _mp({ id: 2, name: 'Gartenwasser', type: 'water' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await screen.findByText('Hauptzähler Strom');
    await user.click(screen.getByRole('button', { name: 'Typ' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.adminMeasuringPoints.type')).toContain('water'),
    );
  });

  it('persistiert nichts, wenn „Filter merken" aus ist (Default)', async () => {
    _mockList([
      _mp({ id: 1, name: 'Hauptzähler Strom', type: 'electricity' }),
      _mp({ id: 2, name: 'Gartenwasser', type: 'water' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await screen.findByText('Hauptzähler Strom');
    await user.click(screen.getByRole('button', { name: 'Typ' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Wasser' }));

    // Filter wirkt (Strom-Card fällt raus), aber nichts wird persistiert.
    expect(screen.queryByText('Hauptzähler Strom')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('filters.adminMeasuringPoints.type')).toBeNull();
  });

  it('filtert die Liste nach Eigentümer inkl. „ohne Eigentümer"-Option', async () => {
    _mockList([
      _mp({ id: 1, name: 'MP-Mueller', current_owner_id: 3, current_owner_name: 'Müller' }),
      _mp({ id: 2, name: 'MP-Schmidt', current_owner_id: 4, current_owner_name: 'Schmidt' }),
      _mp({ id: 3, name: 'MP-Ohne' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    expect(await screen.findByText('MP-Mueller')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eigentümer' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Müller' }));
    expect(screen.getByText('MP-Mueller')).toBeInTheDocument();
    expect(screen.queryByText('MP-Schmidt')).not.toBeInTheDocument();
    expect(screen.queryByText('MP-Ohne')).not.toBeInTheDocument();

    // „ohne Eigentümer" zusätzlich ankreuzen → MP ohne Zuordnung kommt dazu.
    await user.click(screen.getByRole('checkbox', { name: 'ohne Eigentümer' }));
    expect(screen.getByText('MP-Mueller')).toBeInTheDocument();
    expect(screen.getByText('MP-Ohne')).toBeInTheDocument();
    expect(screen.queryByText('MP-Schmidt')).not.toBeInTheDocument();
  });

  it('filtert die Liste nach Lieferant inkl. „ohne Lieferant"-Option', async () => {
    _mockList(
      [
        _mp({
          id: 1,
          name: 'MP-Stadtwerke',
          current_supplier_id: 7,
          current_supplier_name: 'Stadtwerke',
        }),
        _mp({
          id: 2,
          name: 'MP-Regional',
          current_supplier_id: 8,
          current_supplier_name: 'Regionalwerk',
        }),
        _mp({ id: 3, name: 'MP-Ohne' }),
      ],
      [
        { id: 7, name: 'Stadtwerke' },
        { id: 8, name: 'Regionalwerk' },
      ],
    );
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    expect(await screen.findByText('MP-Stadtwerke')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lieferant' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Stadtwerke' }));
    expect(screen.getByText('MP-Stadtwerke')).toBeInTheDocument();
    expect(screen.queryByText('MP-Regional')).not.toBeInTheDocument();
    expect(screen.queryByText('MP-Ohne')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'ohne Lieferant' }));
    expect(screen.getByText('MP-Ohne')).toBeInTheDocument();
    expect(screen.queryByText('MP-Regional')).not.toBeInTheDocument();
  });

  it('zeigt den Lieferant-Filter auch ohne zugeordnete Messstellen (Stammliste)', async () => {
    // Kein MP hat einen Lieferanten — das Dropdown muss trotzdem erscheinen,
    // weil die Optionen aus der Lieferanten-Stammliste kommen.
    _mockList([_mp({ id: 1, name: 'MP-Ohne' })], [{ id: 9, name: 'Neuer Versorger' }]);
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    expect(await screen.findByText('MP-Ohne')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lieferant' }));
    expect(await screen.findByRole('checkbox', { name: 'Neuer Versorger' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'ohne Lieferant' })).toBeInTheDocument();
  });

  it('filtert die Liste nach Hauptstandort und setzt alle Filter zurück', async () => {
    _mockList([
      _mp({ id: 1, name: 'MP-Hof', main_location_id: 11, main_location_name: 'Hof' }),
      _mp({ id: 2, name: 'MP-Halle', main_location_id: 12, main_location_name: 'Halle' }),
      _mp({ id: 3, name: 'MP-Ohne' }),
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    expect(await screen.findByText('MP-Hof')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hauptstandort' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Hof' }));
    expect(screen.getByText('MP-Hof')).toBeInTheDocument();
    expect(screen.queryByText('MP-Halle')).not.toBeInTheDocument();
    expect(screen.queryByText('MP-Ohne')).not.toBeInTheDocument();

    // „Filter zurücksetzen" bringt alle Cards zurück.
    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getByText('MP-Hof')).toBeInTheDocument();
    expect(screen.getByText('MP-Halle')).toBeInTheDocument();
    expect(screen.getByText('MP-Ohne')).toBeInTheDocument();
  });

  it('sendet supplier_id + supplier_valid_from, wenn ein Lieferant gewählt ist', async () => {
    let createBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
      http.get('/api/v1/owners', () => HttpResponse.json([])),
      http.get('/api/v1/suppliers', () =>
        HttpResponse.json([
          {
            id: 9,
            name: 'Stadtwerke',
            address_street: null,
            address_postcode: null,
            address_city: null,
            email: null,
            phone: null,
            vat_id: null,
            tax_id: null,
            note: null,
          },
        ]),
      ),
      http.post('/api/v1/measuring-points', async ({ request }) => {
        createBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 99 }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<MeasuringPointsAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Messstelle anlegen/i }));
    await user.click(await screen.findByRole('button', { name: /Strom/i }));
    await user.type(screen.getByLabelText('Name'), 'Neuer Zähler');
    await user.selectOptions(screen.getByLabelText('Lieferant (optional)'), '9');
    await user.type(screen.getByLabelText('Seriennummer'), 'SN-1');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(createBody).not.toBeNull());
    expect(createBody!['supplier_id']).toBe(9);
    // valid_from = installed_at (Default heute, vorbefüllt im Formular).
    expect(createBody!['supplier_valid_from']).toBe(createBody!['installed_at']);
  });
});
