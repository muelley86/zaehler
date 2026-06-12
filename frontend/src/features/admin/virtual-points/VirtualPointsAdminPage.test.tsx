/**
 * Tests für den Admin-Bereich „Verrechnete Messstellen": Liste mit
 * Komponenten-Zeilen, Anlegen (POST-Payload), Löschen mit Bestätigung,
 * Anzeige von Backend-Validierungsfehlern (422).
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { VirtualPointsAdminPage } from './VirtualPointsAdminPage';

const _mps = [
  { id: 1, name: 'Biogas-Trafo', type: 'electricity' },
  { id: 2, name: 'Solar-Erzeugung', type: 'electricity' },
  { id: 3, name: 'Solar-Trafo', type: 'electricity' },
  { id: 4, name: 'Wasser-Haupt', type: 'water' },
];

const _vmp = {
  id: 7,
  name: 'Biogasanlage real',
  note: null,
  type: 'electricity',
  components: [
    {
      id: 70,
      measuring_point_id: 1,
      measuring_point_name: 'Biogas-Trafo',
      direction: 'bezug',
      sign: 1,
    },
    {
      id: 71,
      measuring_point_id: 3,
      measuring_point_name: 'Solar-Trafo',
      direction: 'einspeisung',
      sign: -1,
    },
  ],
};

function mockLists(vmps: unknown[] = [_vmp]) {
  server.use(
    http.get('/api/v1/virtual-measuring-points', () => HttpResponse.json(vmps)),
    http.get('/api/v1/measuring-points', () => HttpResponse.json(_mps)),
  );
}

describe('VirtualPointsAdminPage', () => {
  it('listet verrechnete Messstellen mit Komponenten und Vorzeichen', async () => {
    mockLists();
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    expect(await screen.findByText('Biogasanlage real')).toBeInTheDocument();
    // Namen erscheinen zusätzlich als <option> im Anlege-Formular → getAllByText.
    expect(screen.getAllByText('Biogas-Trafo').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Solar-Trafo').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Einspeisung').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('−').length).toBeGreaterThanOrEqual(1);
    // Richtungs-Label gezielt in den Komponenten-Zeilen der Karte prüfen —
    // getAllByText allein würde auch die <option>-Texte des Formulars treffen.
    const rows = screen.getAllByRole('listitem');
    const bezugRow = rows.find((li) => li.textContent?.includes('Biogas-Trafo'));
    expect(bezugRow).toBeDefined();
    expect(within(bezugRow!).getByText('Bezug')).toBeInTheDocument();
    const einspeisungRow = rows.find((li) => li.textContent?.includes('Solar-Trafo'));
    expect(einspeisungRow).toBeDefined();
    expect(within(einspeisungRow!).getByText('Einspeisung')).toBeInTheDocument();
  });

  it('legt eine verrechnete Messstelle per POST an (Komponenten-Payload)', async () => {
    mockLists([]);
    let postBody: unknown = null;
    server.use(
      http.post('/api/v1/virtual-measuring-points', async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json(_vmp, { status: 201 });
      }),
    );
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    fireEvent.change(await screen.findByLabelText(/^Name$/), {
      target: { value: 'Biogasanlage real' },
    });
    // Erste Komponente: Biogas-Trafo (+, Bezug).
    fireEvent.change(screen.getByLabelText('Messstelle 1'), { target: { value: '1' } });
    // Zweite Komponente hinzufügen: Solar-Trafo, Einspeisung, Vorzeichen −.
    fireEvent.click(screen.getByRole('button', { name: /Komponente hinzufügen/i }));
    fireEvent.change(await screen.findByLabelText('Messstelle 2'), { target: { value: '3' } });
    const directionSelects = screen.getAllByLabelText('Richtung');
    fireEvent.change(directionSelects[1]!, { target: { value: 'einspeisung' } });
    const signButtons = screen.getAllByRole('button', { name: 'Vorzeichen: plus' });
    fireEvent.click(signButtons[1]!);
    fireEvent.click(screen.getByRole('button', { name: /^Anlegen$/ }));
    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody).toEqual({
      name: 'Biogasanlage real',
      note: null,
      type: 'electricity',
      components: [
        { measuring_point_id: 1, direction: 'bezug', sign: 1 },
        { measuring_point_id: 3, direction: 'einspeisung', sign: -1 },
      ],
    });
  });

  it('löscht nach Bestätigung per DELETE', async () => {
    mockLists();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    server.use(
      http.delete('/api/v1/virtual-measuring-points/7', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    fireEvent.click(await screen.findByRole('button', { name: /Löschen/i }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('zeigt einen 422-Fehler des Backends im Formular', async () => {
    mockLists([]);
    server.use(
      http.post('/api/v1/virtual-measuring-points', () =>
        HttpResponse.json(
          {
            title: 'Component type mismatch',
            detail:
              "Messstelle 'Wasser-Haupt' hat Typ water, die virtuelle Messstelle aber Typ electricity.",
            status: 422,
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    fireEvent.change(await screen.findByLabelText(/^Name$/), { target: { value: 'Kaputt' } });
    fireEvent.change(screen.getByLabelText('Messstelle 1'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Anlegen$/ }));
    expect(await screen.findByText(/hat Typ water/i)).toBeInTheDocument();
  });
});
