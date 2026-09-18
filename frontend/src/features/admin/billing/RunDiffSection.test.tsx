/**
 * Versionsvergleich: geänderte Zeilen mit Feldern und Differenzen, unveränderte werden nur gezählt.
 * Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { RunDiffSection } from './RunDiffSection';

const DIFF = {
  monat: '2026-08',
  alt: {
    run_id: 7,
    version: 1,
    status: 'ersetzt',
    begruendung: null,
    finalized_at: '2026-09-06T00:00:00Z',
    preis_eur: '0.25',
    gesamt_eur: '250.00',
    saldo_eur: '0.00',
  },
  neu: {
    run_id: 8,
    version: 2,
    status: 'festgeschrieben',
    begruendung: 'Zähler falsch abgelesen',
    finalized_at: '2026-09-07T00:00:00Z',
    preis_eur: '0.25',
    gesamt_eur: '250.00',
    saldo_eur: '0.00',
  },
  zeilen: [
    {
      label: 'Stall A',
      status: 'geaendert',
      felder: ['stand_neu', 'kwh', 'eur'],
      kwh_alt: '500',
      kwh_neu: '700',
      eur_alt: '125.00',
      eur_neu: '175.00',
      kwh_delta: '200',
      eur_delta: '50.00',
    },
    {
      label: 'Pumpe',
      status: 'gleich',
      felder: [],
      kwh_alt: '200',
      kwh_neu: '200',
      eur_alt: '50.00',
      eur_neu: '50.00',
      kwh_delta: '0',
      eur_delta: '0.00',
    },
    {
      label: 'Werkstatt',
      status: 'neu',
      felder: [],
      kwh_alt: null,
      kwh_neu: '30',
      eur_alt: null,
      eur_neu: '7.50',
      kwh_delta: '30',
      eur_delta: '7.50',
    },
  ],
  kwh_delta: '230',
  eur_delta: '57.50',
};

describe('RunDiffSection', () => {
  it('zeigt Begründung, Differenzen und nur die geänderten Zeilen', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs/8/vergleich', () => HttpResponse.json(DIFF)),
    );
    renderWithRouter(<RunDiffSection circleId={1} runId={8} />);

    expect(await screen.findByText('Vergleich Version 1 → 2')).toBeInTheDocument();
    expect(screen.getByText('Zähler falsch abgelesen')).toBeInTheDocument();

    const tabelle = screen.getByLabelText('Geänderte Zeilen');
    expect(within(tabelle).getByText('Stall A')).toBeInTheDocument();
    expect(within(tabelle).getByText('Werkstatt')).toBeInTheDocument();
    expect(within(tabelle).queryByText('Pumpe')).not.toBeInTheDocument();
    // Felder werden in die Sprache der Oberfläche übersetzt.
    expect(within(tabelle).getByText('Stand neu, kWh, Betrag')).toBeInTheDocument();
    expect(within(tabelle).getByText('+200')).toBeInTheDocument();
    expect(screen.getByText('1 von 3 Zeilen unverändert.')).toBeInTheDocument();
  });

  it('zeigt einen nicht berechneten Preis als Strich, nicht als Null', async () => {
    const ohneErgebnis = {
      ...DIFF,
      neu: { ...DIFF.neu, preis_eur: null, gesamt_eur: null, saldo_eur: null },
    };
    server.use(
      http.get('/api/v1/billing-circles/1/runs/8/vergleich', () => HttpResponse.json(ohneErgebnis)),
    );
    renderWithRouter(<RunDiffSection circleId={1} runId={8} />);

    expect(await screen.findByText('0,25 €/kWh → —')).toBeInTheDocument();
  });

  it('sagt es, wenn sich keine Zeile geändert hat', async () => {
    const ohne = { ...DIFF, zeilen: [DIFF.zeilen[1]], kwh_delta: '0', eur_delta: '0.00' };
    server.use(
      http.get('/api/v1/billing-circles/1/runs/8/vergleich', () => HttpResponse.json(ohne)),
    );
    renderWithRouter(<RunDiffSection circleId={1} runId={8} />);

    expect(await screen.findByText(/Keine Zeile hat sich geändert/)).toBeInTheDocument();
  });
});
