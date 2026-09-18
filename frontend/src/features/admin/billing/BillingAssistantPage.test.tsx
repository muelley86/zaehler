/**
 * Abrechnungsassistent: Schritt 1 fordert die Rechnung, Schritt 3 legt den Entwurf an, Schritt 4
 * sperrt das Festschreiben bei blockierenden Befunden und verlinkt danach Anhang und Übertragung.
 * Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingAssistantPage } from './BillingAssistantPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: '1' }) };
});

const KREIS = {
  id: 1,
  code: 'NORD',
  name: 'Musterhof',
  rechnungsleger: 'Musterhof GmbH',
  abnahmestelle: 'AID-000001',
  marktlokation: null,
  created_at: '2026-01-01T00:00:00Z',
};

const RECHNUNG = {
  id: 3,
  circle_id: 1,
  nummer: 'TEST-0001',
  datum: '2026-09-05',
  aid: 'AID-000001',
  marktlokation: '10000000001',
  period_from: '2026-08-01',
  period_to: '2026-08-31',
  period_month: '2026-08',
  verbrauch_kwh: '1000',
  leistungsspitze_kw: '10',
  betrag_netto: '250.00',
  hinweise: [],
  pdf_sha256: 'abc',
  pdf_size: 1234,
  pdf_filename: 'rechnung.pdf',
  uploaded_by: 1,
  created_at: '2026-09-06T00:00:00Z',
  positions: [],
};

const STAENDE = {
  monat: '2026-08',
  stichtag_alt: '2026-07-31',
  stichtag_neu: '2026-08-31',
  max_abstand_tage: 3,
  findings: [],
  positions: [],
};

function lauf(status: string, blocking: boolean) {
  return {
    id: 7,
    circle_id: 1,
    monat: '2026-08',
    version: 1,
    status,
    invoice_id: 3,
    begruendung: null,
    created_at: '2026-09-06T00:00:00Z',
    created_by: 1,
    finalized_at: status === 'festgeschrieben' ? '2026-09-07T00:00:00Z' : null,
    finalized_by: status === 'festgeschrieben' ? 1 : null,
    preis_eur: '0.25',
    gesamt_eur: '250.00',
    saldo_eur: '0.00',
    blocking_count: blocking ? 1 : 0,
    zusatzkosten: '0',
    aufschlag_prozent: '0',
    aufschlag_ct: '0',
    befunde: blocking
      ? [
          {
            label: 'Stall A',
            code: 'ohne_eigentuemer',
            message: 'Der Position fehlt der Eigentümer.',
            blocking: true,
          },
        ]
      : [],
    result: {
      preis_ct: '25.00',
      preis_eur: '0.25',
      einkaufspreis_ct: '25.00',
      umlagepreis_ct: '25.00',
      bezugsmenge: '1000',
      gesamtkosten: '250.00',
      zaehlersumme: '1000',
      nicht_gemessen_kwh: null,
      gesamt_eur: '250.00',
      saldo_eur: '0.00',
      saldo_grenze_eur: '10.50',
      gruppen: [],
    },
    lines: [],
  };
}

/** Grundhandler; `laeufe` steuert, ob es für den Monat schon einen Lauf gibt. */
function handler(laeufe: Record<string, unknown>[], rechnungen = [RECHNUNG]) {
  return [
    http.get('/api/v1/billing-circles/1', () => HttpResponse.json(KREIS)),
    http.get('/api/v1/billing-circles/1/invoices', () => HttpResponse.json(rechnungen)),
    http.get('/api/v1/billing-circles/1/runs', () => HttpResponse.json(laeufe)),
    http.get('/api/v1/billing-circles/1/runs/7', () => HttpResponse.json(laeufe[0])),
    http.get('/api/v1/billing-circles/1/readings', () => HttpResponse.json(STAENDE)),
  ];
}

const START = { initialEntries: ['/admin/abrechnungskreise/1/assistent?monat=2026-08'] };

describe('BillingAssistantPage', () => {
  it('fordert die Rechnung, bevor ein Entwurf möglich ist', async () => {
    server.use(...handler([], []));
    renderWithRouter(<BillingAssistantPage />, START);

    expect(
      await screen.findByLabelText('Rechnung für 2026-08 importieren (PDF)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Erst die Rechnung importieren.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entwurf anlegen' })).toBeDisabled();
  });

  it('legt den Entwurf für den gewählten Monat an', async () => {
    let gesendet: unknown = null;
    const laeufe: Record<string, unknown>[] = []; // wird beim POST befüllt, nicht ersetzt
    server.use(
      ...handler(laeufe),
      http.post('/api/v1/billing-circles/1/runs', async ({ request }) => {
        gesendet = await request.json();
        laeufe.push(lauf('entwurf', false));
        return HttpResponse.json(laeufe[0], { status: 201 });
      }),
    );
    renderWithRouter(<BillingAssistantPage />, START);

    expect(await screen.findByText(/Rechnung TEST-0001/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf anlegen' }));

    await waitFor(() => expect(gesendet).toEqual({ monat: '2026-08' }));
    expect(await screen.findByText('0,25 €/kWh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeEnabled();
  });

  it('sperrt das Festschreiben bei blockierenden Befunden', async () => {
    server.use(...handler([lauf('entwurf', true)]));
    renderWithRouter(<BillingAssistantPage />, START);

    expect(await screen.findByText(/Der Position fehlt der Eigentümer\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeDisabled();
    expect(
      screen.getByText('1 blockierende Befunde verhindern das Festschreiben.'),
    ).toBeInTheDocument();
  });

  it('sperrt den Knopf bis das Neuladen fertig ist (kein zweiter POST)', async () => {
    let posts = 0;
    const laeufe: Record<string, unknown>[] = [];
    server.use(
      ...handler(laeufe),
      http.post('/api/v1/billing-circles/1/runs', () => {
        posts += 1;
        laeufe.push(lauf('entwurf', false));
        return HttpResponse.json(laeufe[0], { status: 201 });
      }),
    );
    renderWithRouter(<BillingAssistantPage />, START);

    await screen.findByText(/Rechnung TEST-0001/);
    const knopf = screen.getByRole('button', { name: 'Entwurf anlegen' });
    fireEvent.click(knopf);
    fireEvent.click(knopf); // zweiter Klick, während noch geladen wird
    fireEvent.click(knopf);

    await screen.findByText('0,25 €/kWh');
    expect(posts).toBe(1);
  });

  it('zeigt Schritt 2 als offen, wenn es Befunde zu den Ständen gibt', async () => {
    server.use(
      // Vor den Grundhandlern: msw nimmt den ersten passenden.
      http.get('/api/v1/billing-circles/1/readings', () =>
        HttpResponse.json({
          ...STAENDE,
          findings: [
            {
              position_id: 5,
              label: 'Stall A',
              code: 'stand_fehlt',
              message: 'Für den Stichtag fehlt eine Ablesung.',
            },
          ],
        }),
      ),
      ...handler([]),
    );
    renderWithRouter(<BillingAssistantPage />, START);

    expect(await screen.findByText(/Für den Stichtag fehlt eine Ablesung\./)).toBeInTheDocument();
    // Der Schritt bleibt offen, solange Befunde offen sind.
    const kopf = screen.getByText('2. Zählerstände zum Monatsende').closest('span');
    expect(kopf).toHaveTextContent('Offen:');
  });

  it('sperrt das Festschreiben, wenn der Lauf kein Ergebnis hat', async () => {
    const ohneErgebnis = { ...lauf('entwurf', false), result: null };
    server.use(...handler([ohneErgebnis]));
    renderWithRouter(<BillingAssistantPage />, START);

    expect(await screen.findByText(/Rechnung TEST-0001/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeDisabled();
    const kopf = screen.getByText('3. Entwurf berechnen').closest('span');
    expect(kopf).toHaveTextContent('Offen:');
  });

  it('verlinkt nach dem Festschreiben Anhang und Übertragung', async () => {
    server.use(...handler([lauf('festgeschrieben', false)]));
    renderWithRouter(<BillingAssistantPage />, START);

    expect(await screen.findByText(/Festgeschrieben – Version 1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rechnungsanhang drucken' })).toHaveAttribute(
      'href',
      '/admin/abrechnungskreise/1/laeufe/7/anhang',
    );
    expect(screen.getByRole('link', { name: 'Nach Agrarmonitor übertragen' })).toHaveAttribute(
      'href',
      '/admin/abrechnungskreise/1/laeufe/7',
    );
    expect(screen.queryByRole('button', { name: 'Festschreiben' })).not.toBeInTheDocument();
  });
});
