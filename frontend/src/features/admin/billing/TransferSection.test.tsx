/**
 * Übertragung nach Agrarmonitor: Formularzeilen, Kopieren in die Zwischenablage, Abhaken mit
 * Belegnummer, Zurücknehmen; im Entwurf ist das Abhaken gesperrt. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { TransferSection } from './TransferSection';

const ZEILE = {
  datum: '2026-08-31',
  menge: '700.00',
  beschreibung: 'Strom (gewerblich) Kostenstelle 10101',
  preis_eur: '0.25',
  umsatzsteuer: '19.0',
  betrag: '175.00',
  betrag_lauf: '175.00',
  positionen: ['Stall', 'Pumpe'],
};

const ABGEHAKT = {
  id: 3,
  belegnummer: 'RE-4711',
  note: null,
  transferred_at: '2026-09-18T08:00:00Z',
  transferred_by: 1,
};

function ansicht(transfer: Record<string, unknown> | null) {
  return {
    run_id: 7,
    monat: '2026-08',
    monatsname: 'August 2026',
    stichtag: '2026-08-31',
    kopfsatz: 'Für den Stromverbrauch im Monat August 2026 erlauben wir uns …',
    preis_eur: '0.25',
    umsatzsteuer: '19.0',
    empfaenger: [
      {
        owner_name: 'Muster A KG',
        internal_allocation: false,
        rows: [ZEILE],
        netto: '175.00',
        brutto: '208.25',
        netto_lauf: '175.00',
        differenz: '0.00',
        transfer,
      },
    ],
  };
}

describe('TransferSection', () => {
  it('zeigt die Formularzeilen, kopiert Werte und hakt mit Belegnummer ab', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    let body: unknown = null;
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/transfer', () => HttpResponse.json(ansicht(null))),
      http.post('/api/v1/billing-circles/1/runs/7/transfers', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(ansicht(ABGEHAKT), { status: 201 });
      }),
    );
    renderWithRouter(<TransferSection circleId={1} runId={7} status="festgeschrieben" />);

    expect(
      await screen.findByText(/Für den Stromverbrauch im Monat August 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText('31.08.2026')).toBeInTheDocument();
    expect(screen.getAllByText('175,00 €')).toHaveLength(2); // Zeilenbetrag und Summe netto
    expect(screen.getByText(/Summe brutto/)).toBeInTheDocument();
    expect(screen.getByText('208,25 €')).toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText(/^Menge Strom \(gewerblich\) Kostenstelle 10101 kopieren/),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('700'));

    fireEvent.change(screen.getByLabelText(/Belegnummer/), { target: { value: 'RE-4711' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übertragen' }));
    await waitFor(() =>
      expect(body).toEqual({ owner_name: 'Muster A KG', belegnummer: 'RE-4711' }),
    );
    expect(await screen.findByText(/übertragen · Beleg RE-4711/)).toBeInTheDocument();
  });

  it('sperrt das Abhaken im Entwurf', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/transfer', () => HttpResponse.json(ansicht(null))),
    );
    renderWithRouter(<TransferSection circleId={1} runId={7} status="entwurf" />);
    expect(await screen.findByText('Erst festschreiben')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übertragen' })).not.toBeInTheDocument();
  });

  it('sperrt das Abhaken bei einer ersetzten Version', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/transfer', () => HttpResponse.json(ansicht(null))),
    );
    renderWithRouter(<TransferSection circleId={1} runId={7} status="ersetzt" />);
    expect(
      await screen.findByText('Version ersetzt – keine Übertragung mehr möglich'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übertragen' })).not.toBeInTheDocument();
  });

  it('nimmt eine Markierung zurück', async () => {
    let geloescht = false;
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/transfer', () =>
        HttpResponse.json(ansicht(ABGEHAKT)),
      ),
      http.delete('/api/v1/billing-circles/1/runs/7/transfers/3', () => {
        geloescht = true;
        return HttpResponse.json(ansicht(null));
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRouter(<TransferSection circleId={1} runId={7} status="festgeschrieben" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Zurücknehmen' }));
    await waitFor(() => expect(geloescht).toBe(true));
    expect(await screen.findByLabelText(/Belegnummer/)).toBeInTheDocument();
  });
});
