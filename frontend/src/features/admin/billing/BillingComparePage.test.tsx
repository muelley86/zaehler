/**
 * Vergleich frei gewählter Abrechnungsläufe: zwei Läufe als Gegenüberstellung, ab drei Läufen als
 * Reihe mit Diagramm. Das Diagramm ist gemockt — Recharts misst unter jsdom nichts; geprüft wird,
 * welche Zeile es zeigt. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { BillingCompareValue, BillingComparison } from '@/lib/types';

import { BillingComparePage } from './BillingComparePage';

vi.mock('./CompareChart', () => ({
  CompareChart: ({
    titel,
    einheit,
    punkte,
  }: {
    titel: string;
    einheit: string;
    punkte: { x: string; wert: number | null }[];
  }) => (
    <div data-testid="diagramm">
      {titel} ({einheit}): {punkte.map((p) => `${p.x}=${p.wert ?? '—'}`).join(' ')}
    </div>
  ),
}));

function w(
  wert: string | null,
  delta: string | null = null,
  prozent: string | null = null,
): BillingCompareValue {
  return { wert, delta, delta_prozent: prozent };
}

const ZWEI: BillingComparison = {
  laeufe: [
    { run_id: 7, monat: '2026-08', version: 1, status: 'festgeschrieben', hat_ergebnis: true },
    { run_id: 9, monat: '2026-09', version: 1, status: 'entwurf', hat_ergebnis: true },
  ],
  kennzahlen: [
    { key: 'preis', einheit: 'eur_kwh', werte: [w('0.25'), w('0.30', '0.05', '20.00')] },
    { key: 'bezugsmenge', einheit: 'kwh', werte: [w('1000'), w('800', '-200', '-20.00')] },
    {
      key: 'weiterberechnet',
      einheit: 'eur',
      werte: [w('250.00'), w('240.00', '-10.00', '-4.00')],
    },
    { key: 'differenz_prozent', einheit: 'prozent', werte: [w('0.12'), w('-0.40', '-0.52')] },
  ],
  empfaenger: [
    {
      name: 'Muster A KG',
      internal_allocation: false,
      merkmale_geaendert: [],
      kwh: [w('900'), w('700', '-200', '-22.22')],
      eur: [w('225.00'), w('210.00', '-15.00', '-6.67')],
    },
    {
      name: 'Muster Intern',
      internal_allocation: true,
      merkmale_geaendert: [],
      kwh: [w('100'), w('100', '0', '0.00')],
      eur: [w('25.00'), w('30.00', '5.00', '20.00')],
    },
  ],
  positionen: [
    {
      name: 'Stall',
      internal_allocation: false,
      merkmale_geaendert: ['kostenstelle'],
      kwh: [w('500'), w('300', '-200', '-40.00')],
      eur: [w('125.00'), w('90.00', '-35.00', '-28.00')],
    },
    {
      name: 'Werkstatt',
      internal_allocation: false,
      merkmale_geaendert: [],
      kwh: [w(null), w('40')],
      eur: [w(null), w('12.00')],
    },
  ],
};

const DREI: BillingComparison = {
  ...ZWEI,
  laeufe: [
    ...ZWEI.laeufe,
    { run_id: 11, monat: '2026-10', version: 2, status: 'festgeschrieben', hat_ergebnis: true },
  ],
  kennzahlen: ZWEI.kennzahlen.map((k) => ({ ...k, werte: [...k.werte, w('1', '0', null)] })),
  empfaenger: ZWEI.empfaenger.map((z) => ({
    ...z,
    kwh: [...z.kwh, w('50', '-50', '-50.00')],
    eur: [...z.eur, w('15.00', '-15.00', '-50.00')],
  })),
  positionen: ZWEI.positionen.map((z) => ({
    ...z,
    kwh: [...z.kwh, w('200', '-100', '-33.33')],
    eur: [...z.eur, w('60.00', '-30.00', '-33.33')],
  })),
};

function seite(suche: string) {
  return renderWithRouter(
    <Routes>
      <Route path="/admin/abrechnungskreise/:id/vergleich" element={<BillingComparePage />} />
    </Routes>,
    { initialEntries: [`/admin/abrechnungskreise/1/vergleich${suche}`] },
  );
}

describe('BillingComparePage', () => {
  it('stellt zwei Läufe mit Abweichung zum Vorlauf gegenüber', async () => {
    // Arrange
    let abfrage = '';
    server.use(
      http.get('/api/v1/billing-circles/1/runs/vergleich', ({ request }) => {
        abfrage = new URL(request.url).search;
        return HttpResponse.json(ZWEI);
      }),
    );

    // Act
    seite('?laeufe=9,7');

    // Assert: Spalten je Lauf, Kennzahlen mit Einheit und Abweichung.
    const kennzahlen = within(await screen.findByRole('table', { name: 'Kennzahlen' }));
    expect(abfrage).toBe('?lauf=9&lauf=7');
    expect(kennzahlen.getByRole('link', { name: '08/26 · V1' })).toHaveAttribute(
      'href',
      '/admin/abrechnungskreise/1/laeufe/7',
    );
    expect(kennzahlen.getByText('Entwurf')).toBeInTheDocument();
    const preis = within(kennzahlen.getByRole('row', { name: /^Preis/ }));
    expect(preis.getByText('0,25 €/kWh')).toBeInTheDocument();
    expect(preis.getByText('0,3 €/kWh')).toBeInTheDocument();
    expect(preis.getByText('+0,05 €/kWh (+20,00 %)')).toBeInTheDocument();
    const anteil = within(kennzahlen.getByRole('row', { name: /^Differenz in %/ }));
    expect(anteil.getByText('-0,52 %-Punkte')).toBeInTheDocument();

    // Empfänger und Positionen standardmäßig in Euro.
    const stall = within(
      within(screen.getByRole('table', { name: 'Positionen' })).getByRole('row', {
        name: /^Stall/,
      }),
    );
    expect(stall.getByText('125,00 €')).toBeInTheDocument();
    expect(stall.getByText('-35,00 € (-28,00 %)')).toBeInTheDocument();
    expect(stall.getByText('geändert: Kostenstelle')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: 'Empfänger' })).getByText('intern'),
    ).toBeInTheDocument();
    // Zwei Läufe sind eine Gegenüberstellung — ohne Diagramm.
    expect(screen.queryByTestId('diagramm')).not.toBeInTheDocument();
  });

  it('zeigt fehlende Positionen als Strich und schaltet auf kWh um', async () => {
    // Arrange
    server.use(http.get('/api/v1/billing-circles/1/runs/vergleich', () => HttpResponse.json(ZWEI)));
    seite('?laeufe=7,9');
    const positionen = within(await screen.findByRole('table', { name: 'Positionen' }));
    const werkstatt = within(positionen.getByRole('row', { name: /^Werkstatt/ }));
    expect(werkstatt.getByText('—')).toBeInTheDocument();
    expect(werkstatt.getByText('12,00 €')).toBeInTheDocument();

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'kWh' }));

    // Assert
    const stall = within(positionen.getByRole('row', { name: /^Stall/ }));
    expect(stall.getByText('500 kWh')).toBeInTheDocument();
    expect(stall.getByText('-200 kWh (-40,00 %)')).toBeInTheDocument();
  });

  it('zeigt ab drei Läufen ein Diagramm der gewählten Zeile', async () => {
    // Arrange
    server.use(http.get('/api/v1/billing-circles/1/runs/vergleich', () => HttpResponse.json(DREI)));

    // Act
    seite('?laeufe=7,9,11');

    // Assert: Standard ist die weiterberechnete Summe.
    expect(await screen.findByTestId('diagramm')).toHaveTextContent(
      'Weiterberechnet (€): 08/26 · V1=250 09/26 · V1=240 10/26 · V2=1',
    );

    // Act: eine Position anklicken.
    fireEvent.click(screen.getByRole('button', { name: 'Stall' }));

    // Assert
    expect(screen.getByTestId('diagramm')).toHaveTextContent(
      'Stall (€): 08/26 · V1=125 09/26 · V1=90 10/26 · V2=60',
    );
    expect(screen.getByRole('button', { name: 'Stall' })).toHaveAttribute('aria-pressed', 'true');

    // Act: in kWh folgt das Diagramm der Einheit.
    fireEvent.click(screen.getByRole('button', { name: 'kWh' }));
    expect(screen.getByTestId('diagramm')).toHaveTextContent('Stall (kWh): 08/26 · V1=500');
  });

  it('verlangt mindestens zwei Läufe und fragt sonst nichts ab', async () => {
    let abgefragt = false;
    server.use(
      http.get('/api/v1/billing-circles/1/runs/vergleich', () => {
        abgefragt = true;
        return HttpResponse.json(ZWEI);
      }),
    );

    seite('?laeufe=7,abc,7');

    expect(
      await screen.findByText('Bitte mindestens zwei Abrechnungsläufe zum Vergleichen auswählen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrechnungskreis/ })).toHaveAttribute(
      'href',
      '/admin/abrechnungskreise/1',
    );
    expect(abgefragt).toBe(false);
  });

  it('zeigt die Fehlermeldung des Servers', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs/vergleich', () =>
        HttpResponse.json({ title: 'Billing run not found', status: 404 }, { status: 404 }),
      ),
    );

    seite('?laeufe=7,999');

    expect(await screen.findByText('Billing run not found')).toBeInTheDocument();
  });
});
