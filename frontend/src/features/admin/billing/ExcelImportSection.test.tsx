/**
 * Excel-Weg: Vorschau nach Dateiauswahl, Übernahme auf Knopfdruck, Fehler des Servers. Nur fiktive
 * Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { BillingExcelImportRead } from '@/lib/types';

import { ExcelImportSection } from './ExcelImportSection';

const PFAD = '/api/v1/billing-circles/1/runs/7/excel-import';

function bericht(uebernommen: boolean): BillingExcelImportRead {
  const leer = { hinweis: null, excel_korrektur: null, app_korrektur: '0' };
  return {
    uebernommen,
    zeilen: [
      {
        ...leer,
        label: 'Stall A',
        status: 'gleich',
        app_stand_alt: '1',
        app_stand_neu: '2',
        excel_stand_alt: '1',
        excel_stand_neu: '2',
      },
      {
        ...leer,
        label: 'Pumpe',
        status: 'abweichend',
        app_stand_alt: '0',
        app_stand_neu: '200',
        excel_stand_alt: '0',
        excel_stand_neu: '210',
      },
      {
        label: 'Fremd',
        status: 'unbekannt',
        hinweis: 'Keine Position mit dieser Bezeichnung.',
        app_stand_alt: null,
        app_stand_neu: null,
        app_korrektur: null,
        excel_stand_alt: null,
        excel_stand_neu: null,
        excel_korrektur: null,
      },
    ],
    parameter: [{ feld: 'aufschlag_ct', app: '0', excel: '1' }],
  };
}

function waehlen() {
  const file = new File(['{}'], '2026-08_NORD.json', { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('Monats-JSON wählen'), { target: { files: [file] } });
}

describe('ExcelImportSection', () => {
  it('zeigt die Vorschau und übernimmt erst auf Knopfdruck', async () => {
    const aufrufe: string[] = [];
    server.use(
      http.post(PFAD, ({ request }) => {
        const uebernehmen = new URL(request.url).searchParams.get('uebernehmen') ?? '';
        aufrufe.push(uebernehmen);
        return HttpResponse.json(bericht(uebernehmen === 'true'));
      }),
    );
    const onApplied = vi.fn();
    renderWithRouter(<ExcelImportSection base="/billing-circles/1/runs/7" onApplied={onApplied} />);

    waehlen();
    expect(await screen.findByText('Vorschau: 1 abweichend, 1 gleich.')).toBeInTheDocument();
    expect(screen.getByText('wird übernommen')).toBeInTheDocument();
    expect(screen.getByText('Keine Position mit dieser Bezeichnung.')).toBeInTheDocument();
    expect(screen.queryByText('Stall A')).not.toBeInTheDocument(); // gleiche Zeilen ausgeblendet
    expect(screen.getByText(/Aufschlag \(ct\/kWh\)/)).toBeInTheDocument();
    expect(aufrufe).toEqual(['false']);
    expect(onApplied).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Werte übernehmen' }));
    expect(await screen.findByText('Übernommen: 1 Zeilen, 1 Parameter.')).toBeInTheDocument();
    expect(aufrufe).toEqual(['false', 'true']);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('zeigt die Fehlermeldung des Servers', async () => {
    server.use(
      http.post(PFAD, () =>
        HttpResponse.json(
          { title: 'Monthly file not usable', detail: 'Die Datei gilt fuer Juli 2026.' },
          { status: 422 },
        ),
      ),
    );
    renderWithRouter(<ExcelImportSection base="/billing-circles/1/runs/7" onApplied={vi.fn()} />);
    waehlen();
    expect(await screen.findByText('Die Datei gilt fuer Juli 2026.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Werte übernehmen' })).not.toBeInTheDocument(),
    );
  });
});
