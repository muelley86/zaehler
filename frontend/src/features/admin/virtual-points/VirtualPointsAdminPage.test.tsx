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

const _locations = [
  { id: 5, name: 'Keller', main_location_id: 2, main_location_name: 'Hof' },
  { id: 6, name: 'Garage', main_location_id: null, main_location_name: null },
];

const _vmp = {
  id: 7,
  name: 'Biogasanlage real',
  note: null,
  type: 'electricity',
  location_id: 5,
  location_name: 'Keller',
  main_location_id: 2,
  main_location_name: 'Hof',
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
    http.get('/api/v1/locations', () => HttpResponse.json(_locations)),
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
      location_id: null,
      components: [
        { measuring_point_id: 1, direction: 'bezug', sign: 1 },
        { measuring_point_id: 3, direction: 'einspeisung', sign: -1 },
      ],
    });
  });

  it('zeigt Standort und Hauptstandort auf der Karte', async () => {
    mockLists();
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    expect(await screen.findByText('Biogasanlage real')).toBeInTheDocument();
    expect(screen.getByText(/Keller · Hof/)).toBeInTheDocument();
  });

  it('sendet den gewählten Standort als location_id', async () => {
    mockLists([]);
    let postBody: unknown = null;
    server.use(
      http.post('/api/v1/virtual-measuring-points', async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json(_vmp, { status: 201 });
      }),
    );
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    fireEvent.change(await screen.findByLabelText(/^Name$/), { target: { value: 'Mit Ort' } });
    // Standort-Optionen kommen asynchron von /locations.
    expect(await screen.findByRole('option', { name: 'Keller' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Standort'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Messstelle 1'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Anlegen$/ }));
    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody).toMatchObject({ name: 'Mit Ort', location_id: 5 });
  });

  it('Bearbeiten sendet clear_location, wenn der Standort entfernt wurde', async () => {
    mockLists();
    let patchBody: unknown = null;
    server.use(
      http.patch('/api/v1/virtual-measuring-points/7', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ..._vmp, location_id: null, location_name: null });
      }),
    );
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten/i }));
    // Im Sheet gibt es ein zweites Standort-Select (das Anlege-Formular hat das erste).
    const selects = await screen.findAllByLabelText('Standort');
    const editSelect = selects[selects.length - 1]!;
    await waitFor(() => expect((editSelect as HTMLSelectElement).value).toBe('5'));
    fireEvent.change(editSelect, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Speichern$/ }));
    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toMatchObject({ location_id: null, clear_location: true });
  });

  it('Bearbeiten einer Verrechnung ohne Komponenten sendet keine components-Liste', async () => {
    // Verwaiste Verrechnung (Komponenten-MPs gelöscht → Cascade): das Backend
    // verlangt bei gesendetem ``components`` mindestens einen Eintrag — die
    // leere Liste darf deshalb gar nicht erst mitgehen.
    mockLists([{ ..._vmp, location_id: null, location_name: null, components: [] }]);
    let patchBody: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v1/virtual-measuring-points/7', async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(_vmp);
      }),
    );
    renderWithRouter(<VirtualPointsAdminPage />, { initialEntries: ['/admin/verrechnung'] });
    fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten/i }));
    expect(await screen.findByText(/hat keine Komponenten/i)).toBeInTheDocument();
    const selects = await screen.findAllByLabelText('Standort');
    fireEvent.change(selects[selects.length - 1]!, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^Speichern$/ }));
    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toMatchObject({ location_id: 5, clear_location: false });
    expect(patchBody).not.toHaveProperty('components');
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
