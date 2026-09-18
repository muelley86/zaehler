/**
 * Rechnungsanhang (Druckansicht): Kopf, Preisermittlung, Zählertabelle mit Kennzeichnung der
 * Stände, Summierung je Kostenstelle, Zusammensetzung des Betrags, Drucken. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingAttachmentPage } from './BillingAttachmentPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const params = { id: '1', runId: '7' };
  return { ...actual, useParams: () => params };
});

const ANHANG = {
  head: {
    circle_code: 'NORD',
    circle_name: 'Kreis Nord',
    rechnungsleger: 'Musterhof GmbH',
    abnahmestelle: 'Musterhof 1, 12345 Musterort',
    marktlokation: '10000000001',
    monat: '2026-08',
    monatsname: 'August 2026',
    version: 1,
    status: 'festgeschrieben',
    rechnung_nummer: 'TEST-0001',
    rechnung_datum: '2026-09-05',
    zeitraum_von: '2026-08-01',
    zeitraum_bis: '2026-08-31',
  },
  summary: {
    einkaufspreis_ct: '20.0000',
    umlagepreis_ct: '5.0000',
    preis_ct: '25.00',
    preis_eur: '0.25',
    bezugsmenge: '1000',
    zaehlersumme: '900',
    gesamtkosten: '225.00',
    gesamt_eur: '225.00',
    umsatzsteuer: '19.0',
  },
  empfaenger: [
    {
      owner_name: 'Muster A KG',
      internal_allocation: false,
      lines: [
        {
          label: 'Stall A',
          kostenstelle: 10101,
          serial_numbers: 'TEST-1',
          transformer_factor: 10,
          stand_alt: '100',
          stand_alt_art: 'interpoliert',
          stand_neu: '150',
          stand_neu_art: 'manuell',
          korrektur_kwh: '0',
          kwh: '500',
          eur: '125.00',
          invoice_line: 'Strom (gewerblich) Kostenstelle 10101',
        },
        {
          label: 'Pumpe',
          kostenstelle: 10102,
          serial_numbers: 'TEST-2',
          transformer_factor: null,
          stand_alt: '10',
          stand_alt_art: 'abgelesen',
          stand_neu: '210',
          stand_neu_art: 'abgelesen',
          korrektur_kwh: '0',
          kwh: '200',
          eur: '50.00',
          invoice_line: null,
        },
      ],
      kostenstellen: [
        { kst: '10101', kwh: '500', eur: '125.00' },
        { kst: '10102', kwh: '200', eur: '50.00' },
      ],
      abschnitte: [
        {
          name: 'Energielieferung',
          positionen: [{ name: 'Energielieferung', betrag: '140.00', ct: '20.0000' }],
          summe: '140.00',
          ct: '20.0000',
        },
        {
          name: 'Netznutzung',
          positionen: [{ name: 'Netzentgelt', betrag: '35.00', ct: '5.0000' }],
          summe: '35.00',
          ct: '5.0000',
        },
      ],
      kwh: '700',
      eur: '175.00',
      gesamt_ct: '25.0000',
    },
  ],
};

describe('BillingAttachmentPage', () => {
  afterEach(() => {
    // Stubs des Skalierungstests zurücknehmen, damit andere Tests unberührt bleiben.
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    Reflect.deleteProperty(document, 'fonts');
  });

  it('zeigt Kopf, Preisermittlung, Zähler, Kostenstellen und Zusammensetzung', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true });
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/anhang', () => HttpResponse.json(ANHANG)),
    );
    renderWithRouter(<BillingAttachmentPage />);

    expect(await screen.findByText('Abrechnungsblatt Strombezug')).toBeInTheDocument();
    expect(screen.getByText('Musterhof GmbH')).toBeInTheDocument();
    expect(screen.getByText('Muster A KG')).toBeInTheDocument();
    expect(screen.getByText('TEST-0001')).toBeInTheDocument();
    expect(screen.getByText('05.09.2026')).toBeInTheDocument();
    expect(screen.getByText('01.08.2026 bis 31.08.2026')).toBeInTheDocument();
    expect(screen.getByText('Musterhof 1, 12345 Musterort / 10000000001')).toBeInTheDocument();
    expect(screen.getByText('0,25')).toBeInTheDocument(); // Abrechnungspreis EUR/kWh

    // Zählertabelle: interpolierter Stand "i", manuell erfasster Stand "m".
    const zaehler = screen.getByLabelText('Zähler Muster A KG');
    const stall = within(zaehler).getByText('Stall A').closest('tr');
    expect(stall).not.toBeNull();
    expect(within(stall as HTMLElement).getByText('i')).toBeInTheDocument();
    expect(within(stall as HTMLElement).getByText('m')).toBeInTheDocument();
    // Zeile ohne Zählernummer wird wie in der Excel-Mappe als "ohne Zähler" ausgewiesen.
    expect(within(zaehler).getByText('TEST-2')).toBeInTheDocument();
    expect(within(zaehler).getByText('700,00')).toBeInTheDocument(); // Summe kWh

    const kst = screen.getByLabelText('Kostenstellen Muster A KG');
    expect(within(kst).getByText('10101')).toBeInTheDocument();
    expect(within(kst).getByText('10102')).toBeInTheDocument();

    const zusammen = screen.getByLabelText('Zusammensetzung Muster A KG');
    expect(within(zusammen).getByText('Netzentgelt')).toBeInTheDocument();
    expect(within(zusammen).getByText('Netznutzung')).toBeInTheDocument();
    expect(within(zusammen).getAllByText('Gesamtbetrag (netto)')).toHaveLength(2);
    expect(within(zusammen).getByText('Betrag gesamt netto EUR')).toBeInTheDocument();
    expect(screen.getByText(/zuzüglich 19 % Umsatzsteuer/)).toBeInTheDocument();
    // Betrag des Empfängers: Fuß der Zählertabelle, der Kostenstellen und der Zusammensetzung.
    expect(screen.getAllByText('175,00')).toHaveLength(3);
    // Festgeschrieben: kein Entwurfshinweis.
    expect(screen.queryByText(/Werte können sich noch ändern/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Drucken' }));
    expect(print).toHaveBeenCalled();
  });

  it('verkleinert ein zu hohes Blatt auf eine Seite – auch nach dem Laden der Schriften', async () => {
    // jsdom kennt kein Layout: scrollHeight bildet hier nach, dass `zoom` die Höhe skaliert.
    const UNSKALIERT = 1400;
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return Math.round(UNSKALIERT * (Number(this.style.zoom) || 1));
      },
    });
    let schriftenFertig = () => {};
    const ready = new Promise<void>((aufloesen) => {
      schriftenFertig = () => aufloesen();
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/anhang', () => HttpResponse.json(ANHANG)),
    );
    renderWithRouter(<BillingAttachmentPage />);

    const blatt = await screen.findByLabelText('Abrechnungsblatt Muster A KG');
    const inhalt = blatt.firstElementChild as HTMLElement;
    // A4 hoch minus 2 × 10 mm Rand (1047 px), davon 95 % als Reserve für den Druckumbruch.
    const erwartet = (Math.floor(1047 * 0.95) / UNSKALIERT).toFixed(3);
    expect(inhalt.dataset.zoom).toBe(erwartet);

    // Zweiter Messdurchlauf darf die Verkleinerung nicht wieder aufheben.
    schriftenFertig();
    await waitFor(() => expect(inhalt.dataset.zoom).toBe(erwartet));
  });

  it('weist auf den Entwurf hin', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/anhang', () =>
        HttpResponse.json({ ...ANHANG, head: { ...ANHANG.head, status: 'entwurf' } }),
      ),
    );
    renderWithRouter(<BillingAttachmentPage />);

    expect(await screen.findByText(/Werte können sich noch ändern/)).toBeInTheDocument();
  });

  it('zeigt eine Meldung, wenn der Lauf kein Ergebnis hat', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7/anhang', () =>
        HttpResponse.json(
          { title: 'Billing run has no result', detail: 'Der Lauf konnte nicht berechnet werden.' },
          { status: 409 },
        ),
      ),
    );
    renderWithRouter(<BillingAttachmentPage />);

    expect(await screen.findByText(/Der Lauf konnte nicht berechnet werden\./)).toBeInTheDocument();
  });
});
