/**
 * Stammdaten-Import: Datei wählen → Vorschau (apply=false) → Übernehmen (apply=true) mit
 * demselben Inhalt.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { StammdatenImportCard } from './StammdatenImportCard';

const DATEI = { format: 'stromabrechnung-stammdaten', version: 1, valid_from: '2026-08-01' };

function report(applied: boolean) {
  return {
    applied,
    valid_from: '2026-08-01',
    counts: { aktion: 1, hinweis: 0, fehler: 1 },
    entries: [
      { level: 'aktion', circle: 'NORD', label: 'Anlage West', message: 'Position angelegt' },
      { level: 'fehler', circle: 'NORD', label: 'Pumpe', message: 'ohne Zählernummer' },
    ],
  };
}

describe('StammdatenImportCard', () => {
  it('zeigt die Vorschau und übernimmt denselben Inhalt', async () => {
    const aufrufe: { apply: string | null; body: unknown }[] = [];
    server.use(
      http.post('/api/v1/billing-circles/import', async ({ request }) => {
        const apply = new URL(request.url).searchParams.get('apply');
        aufrufe.push({ apply, body: await request.json() });
        return HttpResponse.json(report(apply === 'true'));
      }),
    );
    const onApplied = vi.fn();
    renderWithRouter(<StammdatenImportCard onApplied={onApplied} />);
    const datei = new File([JSON.stringify(DATEI)], 'import.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import-Datei'), { target: { files: [datei] } });

    expect(await screen.findByText(/Vorschau für import.json/)).toBeInTheDocument();
    expect(screen.getByText(/Pumpe: ohne Zählernummer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(await screen.findByText(/Übernommen für import.json/)).toBeInTheDocument();
    expect(aufrufe.map((a) => a.apply)).toEqual(['false', 'true']);
    expect(aufrufe[0]!.body).toEqual(DATEI);
    expect(aufrufe[1]!.body).toEqual(DATEI);
  });

  it('meldet ungültiges JSON ohne Request', async () => {
    let aufgerufen = false;
    server.use(
      http.post('/api/v1/billing-circles/import', () => {
        aufgerufen = true;
        return HttpResponse.json(report(false));
      }),
    );
    renderWithRouter(<StammdatenImportCard onApplied={() => {}} />);
    const datei = new File(['kein json'], 'x.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import-Datei'), { target: { files: [datei] } });
    expect(await screen.findByText(/kein gültiges JSON/)).toBeInTheDocument();
    expect(aufgerufen).toBe(false);
  });
});
