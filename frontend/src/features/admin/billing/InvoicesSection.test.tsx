/**
 * Rechnungen eines Abrechnungskreises: Liste, Positionen aufklappen, PDF-Upload mit Fehlermeldung.
 * Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { InvoicesSection } from './InvoicesSection';

const INVOICE = {
  id: 3,
  circle_id: 1,
  nummer: 'TEST-100',
  datum: '2026-09-10',
  aid: 'AID-000001',
  marktlokation: '12345678901',
  period_from: '2026-08-01',
  period_to: '2026-08-31',
  period_month: '2026-08',
  verbrauch_kwh: '1000.00',
  leistungsspitze_kw: '12.50',
  betrag_netto: '1350.00',
  hinweise: ['Sonderentgelt: unbekannte Position'],
  pdf_sha256: 'a'.repeat(64),
  pdf_size: 1234,
  pdf_filename: 'rechnung.pdf',
  uploaded_by: 1,
  created_at: '2026-09-17T10:00:00Z',
  positions: [
    {
      id: 30,
      sort_order: 0,
      name: 'Energielieferung',
      abschnitt: 'Energiebeschaffung',
      zeitraum: '01.08.2026 - 31.08.2026',
      menge: '1000.00',
      preis_ct: '10.0000',
      betrag: '100.00',
      kategorie: null,
    },
  ],
};

describe('InvoicesSection', () => {
  it('listet Rechnungen und klappt Positionen auf', async () => {
    server.use(http.get('/api/v1/billing-circles/1/invoices', () => HttpResponse.json([INVOICE])));
    renderWithRouter(<InvoicesSection circleId={1} />);

    const zeile = await screen.findByText(/1\.350,00 €/);
    expect(screen.getByText(/Nr\. TEST-100/)).toHaveTextContent('1 Hinweise');
    expect(screen.getByLabelText('PDF der Rechnung TEST-100 öffnen')).toHaveAttribute(
      'href',
      '/api/v1/billing-circles/1/invoices/3/pdf',
    );
    expect(screen.queryByText('Energielieferung')).not.toBeInTheDocument();
    fireEvent.click(zeile);
    expect(await screen.findByText('Energielieferung')).toBeInTheDocument();
    expect(screen.getByText('Hinweis: Sonderentgelt: unbekannte Position')).toBeInTheDocument();
  });

  it('zeigt die Fehlermeldung des Servers beim Upload', async () => {
    let uploads = 0;
    server.use(
      http.get('/api/v1/billing-circles/1/invoices', () => HttpResponse.json([])),
      http.post('/api/v1/billing-circles/1/invoices', () => {
        uploads += 1;
        return HttpResponse.json(
          { title: 'Invoice belongs to another circle', detail: 'Abnahmestelle passt nicht.' },
          { status: 422 },
        );
      }),
    );
    renderWithRouter(<InvoicesSection circleId={1} />);
    expect(await screen.findByText('Noch keine Rechnungen.')).toBeInTheDocument();

    const file = new File(['%PDF-1.4'], 'rechnung.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Monatsrechnung (PDF) importieren'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('Abnahmestelle passt nicht.')).toBeInTheDocument();
    await waitFor(() => expect(uploads).toBe(1));
  });
});
