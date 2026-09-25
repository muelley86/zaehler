/**
 * Abrechnungsläufe: Liste mit Status und Summen; Entwurf anlegen navigiert zur Detailseite;
 * für einen festgeschriebenen Monat ist eine Begründung Pflicht. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingRunsSection } from './BillingRunsSection';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
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
    expect(screen.getByText('+1,50 €')).toBeInTheDocument();

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
});
