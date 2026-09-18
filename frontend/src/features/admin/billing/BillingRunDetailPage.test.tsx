/**
 * Abrechnungslauf: Ergebnis und Befunde anzeigen, manuelle Werte mit Begründung senden,
 * Festschreiben; festgeschriebene Läufe nur lesbar. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingRunDetailPage } from './BillingRunDetailPage';
import { anteilZuProzent, prozentZuAnteil } from './runFormat';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const params = { id: '1', runId: '7' };
  return { ...actual, useParams: () => params, useNavigate: () => vi.fn() };
});

const ZEILE = {
  id: 70,
  sort_order: 0,
  position_id: 10,
  label: 'Stall A',
  kind: 'meter',
  parent_label: null,
  owner_id: 3,
  owner_name: 'Muster A KG',
  internal_allocation: false,
  kostenstelle: 10101,
  mieter_name: null,
  invoice_line: null,
  measuring_point_id: 5,
  measuring_point_name: 'Stall A',
  serial_numbers: 'TEST-1',
  transformer_factor: 10,
  stand_alt: '100',
  stand_alt_art: 'abgelesen',
  stand_alt_abstand: 0,
  stand_neu: '150.000',
  stand_neu_art: 'interpoliert',
  stand_neu_abstand: 2,
  korrektur_kwh: null,
  korrektur_note: null,
  manual_stand_alt: null,
  manual_stand_neu: null,
  manual_korrektur_kwh: null,
  manual_note: null,
  kwh: '500.000',
  eur: '125.00',
  pruefung: 'OK',
};

function lauf(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    circle_id: 1,
    monat: '2026-08',
    version: 1,
    status,
    invoice_id: 2,
    begruendung: null,
    created_at: '2026-09-01T08:00:00Z',
    created_by: 1,
    finalized_at: status === 'entwurf' ? null : '2026-09-02T08:00:00Z',
    finalized_by: null,
    preis_eur: '0.25',
    gesamt_eur: '125.00',
    saldo_eur: '0.00',
    blocking_count: 0,
    zusatzkosten: '0',
    aufschlag_prozent: '0',
    aufschlag_ct: '0',
    result: {
      preis_ct: '25.00',
      preis_eur: '0.25',
      einkaufspreis_ct: '25',
      umlagepreis_ct: '25',
      bezugsmenge: '500',
      gesamtkosten: '125.00',
      zaehlersumme: '500.000',
      nicht_gemessen_kwh: '0',
      gesamt_eur: '125.00',
      saldo_eur: '0.00',
      saldo_grenze_eur: '5.50',
      gruppen: [
        { name: 'Muster A KG', intern: false, kwh: '500', eur: '125.00', kostenstellen: [] },
      ],
    },
    befunde: [
      {
        position_id: null,
        label: 'Vormonat',
        code: 'kein_vorlauf',
        message: 'Kein festgeschriebener Lauf.',
        blocking: false,
      },
    ],
    lines: [ZEILE],
    ...extra,
  };
}

describe('prozentZuAnteil', () => {
  it('rechnet Prozent ohne Gleitkommafehler in den Anteil um', () => {
    expect(prozentZuAnteil('5')).toBe('0.05');
    expect(prozentZuAnteil('1,1')).toBe('0.011');
    expect(prozentZuAnteil('12,5')).toBe('0.125');
    expect(prozentZuAnteil('100')).toBe('1.00');
    expect(prozentZuAnteil('0')).toBe('0.00');
    expect(() => prozentZuAnteil('abc')).toThrow(RangeError);
    expect(anteilZuProzent('0.07')).toBe('7');
    expect(anteilZuProzent('0.011')).toBe('1,1');
    expect(anteilZuProzent('0')).toBe('0');
    expect(anteilZuProzent('0.125')).toBe('12,5');
  });
});

describe('BillingRunDetailPage', () => {
  it('zeigt Ergebnis, sendet manuelle Werte und schreibt fest', async () => {
    let zeilenBody: unknown = null;
    let festgeschrieben = false;
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7', () => HttpResponse.json(lauf('entwurf'))),
      http.get('/api/v1/billing-circles/1/runs/7/transfer', () =>
        HttpResponse.json({
          run_id: 7,
          monat: '2026-08',
          monatsname: 'August 2026',
          stichtag: '2026-08-31',
          kopfsatz: 'Text',
          preis_eur: '0.25',
          umsatzsteuer: '19.0',
          empfaenger: [],
        }),
      ),
      http.patch('/api/v1/billing-circles/1/runs/7/lines/70', async ({ request }) => {
        zeilenBody = await request.json();
        return HttpResponse.json(
          lauf('entwurf', {
            lines: [{ ...ZEILE, manual_stand_neu: '160', manual_note: 'Foto', kwh: '600' }],
          }),
        );
      }),
      http.post('/api/v1/billing-circles/1/runs/7/finalize', () => {
        festgeschrieben = true;
        return HttpResponse.json(lauf('festgeschrieben'));
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRouter(<BillingRunDetailPage />);

    expect(await screen.findByText(/0,25 €\/kWh/)).toBeInTheDocument();
    expect(screen.getByText('±2 T')).toBeInTheDocument();
    expect(screen.getByText(/Kein festgeschriebener Lauf/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Zeile Stall A manuell ändern'));
    fireEvent.change(screen.getByLabelText(/^Stand neu/), { target: { value: '160' } });
    fireEvent.change(screen.getByLabelText(/^Begründung/), { target: { value: 'Foto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(zeilenBody).toEqual({
        manual_stand_alt: null,
        manual_stand_neu: '160',
        manual_korrektur_kwh: null,
        manual_note: 'Foto',
      }),
    );
    const zeilen = await screen.findByRole('table', { name: 'Zeilen' });
    expect(await within(zeilen).findByText('manuell')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Festschreiben' }));
    await waitFor(() => expect(festgeschrieben).toBe(true));
    expect(await screen.findByText('Festgeschrieben')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Festschreiben' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Zeile Stall A manuell ändern')).not.toBeInTheDocument();
  });

  it('sperrt Festschreiben bei blockierenden Befunden', async () => {
    const blockiert = lauf('entwurf', {
      blocking_count: 1,
      befunde: [
        {
          position_id: 10,
          label: 'Stall A',
          code: 'ohne_eigentuemer',
          message: 'Kein Eigentuemer.',
          blocking: true,
        },
      ],
    });
    server.use(
      http.get('/api/v1/billing-circles/1/runs/7', () => HttpResponse.json(blockiert)),
      http.get('/api/v1/billing-circles/1/runs/7/transfer', () =>
        HttpResponse.json({
          run_id: 7,
          monat: '2026-08',
          monatsname: 'August 2026',
          stichtag: '2026-08-31',
          kopfsatz: 'Text',
          preis_eur: '0.25',
          umsatzsteuer: '19.0',
          empfaenger: [],
        }),
      ),
    );
    renderWithRouter(<BillingRunDetailPage />);
    expect(await screen.findByText(/1 blockierend/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeDisabled();
  });
});
