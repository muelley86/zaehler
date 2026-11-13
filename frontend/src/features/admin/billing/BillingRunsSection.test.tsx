/**
 * Abrechnungsläufe: Liste mit Status und Summen; Entwurf anlegen navigiert zur Detailseite;
 * für einen festgeschriebenen Monat ist eine Begründung Pflicht; ab zwei angehakten Läufen
 * führt „Vergleichen" zur Vergleichsseite. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingRunsSection } from './BillingRunsSection';

const navigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigate };
});

const LAUF = {
  id: 7,
  circle_id: 1,
  monat: '2026-08',
  version: 1,
  status: 'festgeschrieben',
  invoice_id: 2,
  begruendung: null,
  created_at: '2026-09-01T08:00:00Z',
  created_by: 1,
  finalized_at: '2026-09-02T08:00:00Z',
  finalized_by: 1,
  preis_eur: '0.25',
  gesamt_eur: '1250.00',
  saldo_eur: '-1.50',
  differenz_eur: '1.50',
  differenz_prozent: '0.12',
  differenz_kwh: '-20',
  differenz_kwh_prozent: '-0.40',
  blocking_count: 0,
};

describe('BillingRunsSection', () => {
  it('listet Läufe und verlangt Begründung für festgeschriebenen Monat', async () => {
    let body: unknown = null;
    server.use(
      http.get('/api/v1/billing-circles/1/runs', () => HttpResponse.json([LAUF])),
      http.post('/api/v1/billing-circles/1/runs', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { ...LAUF, id: 8, version: 2, status: 'entwurf' },
          { status: 201 },
        );
      }),
    );
    renderWithRouter(<BillingRunsSection circleId={1} />);

    expect(await screen.findByRole('link', { name: '2026-08 · V1' })).toBeInTheDocument();
    expect(screen.getByText('Festgeschrieben')).toBeInTheDocument();
    expect(screen.getByText('1.250,00 €')).toBeInTheDocument();
    // Differenz statt Saldo, mit Vorzeichen aus Nutzersicht (+ = mehr weiterberechnet).
    expect(screen.getByRole('columnheader', { name: 'Differenz' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Saldo' })).not.toBeInTheDocument();
    expect(screen.getByText('+1,50 € (+0,12 %)')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Differenz kWh' })).toBeInTheDocument();
    expect(screen.getByText('-20 kWh (-0,40 %)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Abrechnungsmonat/), { target: { value: '2026-08' } });
    const grund = await screen.findByLabelText(/Begründung neue Version/);
    fireEvent.change(grund, { target: { value: 'Korrektur Zählerstand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Neue Version anlegen' }));

    await waitFor(() =>
      expect(body).toEqual({ monat: '2026-08', begruendung: 'Korrektur Zählerstand' }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/admin/abrechnungskreise/1/laeufe/8'),
    );
  });

  it('zeigt Fehler beim Anlegen', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/runs', () => HttpResponse.json([])),
      http.post('/api/v1/billing-circles/1/runs', () =>
        HttpResponse.json(
          { title: 'No invoice for month', detail: 'Keine Rechnung importiert.' },
          { status: 422 },
        ),
      ),
    );
    renderWithRouter(<BillingRunsSection circleId={1} />);
    expect(await screen.findByText('Noch keine Abrechnungsläufe.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf anlegen' }));
    expect(await screen.findByText('Keine Rechnung importiert.')).toBeInTheDocument();
  });

  it('führt mit zwei angehakten Läufen zum Vergleich', async () => {
    // Arrange
    navigate.mockClear();
    const september = { ...LAUF, id: 9, monat: '2026-09' };
    server.use(
      http.get('/api/v1/billing-circles/1/runs', () => HttpResponse.json([september, LAUF])),
    );
    renderWithRouter(<BillingRunsSection circleId={1} />);
    const vergleichen = await screen.findByRole('button', { name: /Vergleichen/ });
    expect(vergleichen).toBeDisabled();

    // Act: ein Lauf reicht noch nicht.
    fireEvent.click(screen.getByRole('checkbox', { name: '2026-09 · V1 zum Vergleich auswählen' }));
    expect(screen.getByRole('button', { name: 'Vergleichen (1)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '2026-08 · V1 zum Vergleich auswählen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vergleichen (2)' }));

    // Assert
    expect(navigate).toHaveBeenCalledWith('/admin/abrechnungskreise/1/vergleich?laeufe=9,7');
  });

  it('lässt sich wieder abwählen und begrenzt die Auswahl auf zwölf Läufe', async () => {
    // Arrange: dreizehn Läufe.
    const laeufe = Array.from({ length: 13 }, (_, i) => ({
      ...LAUF,
      id: 100 + i,
      monat: `2025-${String(i + 1).padStart(2, '0')}`.replace('2025-13', '2026-01'),
    }));
    server.use(http.get('/api/v1/billing-circles/1/runs', () => HttpResponse.json(laeufe)));
    renderWithRouter(<BillingRunsSection circleId={1} />);
    const boxen = await screen.findAllByRole('checkbox');

    // Act
    for (const box of boxen) fireEvent.click(box);

    // Assert: mehr als zwölf lassen sich nicht vergleichen.
    expect(screen.getByRole('button', { name: 'Vergleichen (13)' })).toBeDisabled();
    expect(screen.getByText('Höchstens 12 Läufe lassen sich vergleichen.')).toBeInTheDocument();
    const erste = boxen[0];
    if (!erste) throw new Error('keine Checkbox');
    fireEvent.click(erste);
    expect(screen.getByRole('button', { name: 'Vergleichen (12)' })).toBeEnabled();
  });
});
