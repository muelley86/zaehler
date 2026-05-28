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
            is_bidirectional: false,
            has_dual_tariff: false,
            transformer_factor: null,
            tank_capacity: null,
            physical_meters: [],
          },
        ]),
      ),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
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
});
