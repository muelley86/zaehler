/**
 * Abrechnungskreise-Seite: Kreise direkt unter der Monatsübersicht, Neuanlage und Stammdaten-Import
 * darunter eingeklappt. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingCirclesAdminPage } from './BillingCirclesAdminPage';

const KREIS = {
  id: 1,
  code: 'NORD',
  name: 'Musterhof',
  abnahmestelle: 'Musterweg 1',
  marktlokation: null,
};

describe('BillingCirclesAdminPage', () => {
  it('zeigt die Kreise unter der Monatsübersicht, Neuanlage und Import eingeklappt', async () => {
    server.use(
      http.get('/api/v1/billing-circles', () => HttpResponse.json([KREIS])),
      http.get('/api/v1/billing-circles/overview', () =>
        HttpResponse.json({ von: '2026-08', bis: '2026-08', monate: ['2026-08'], kreise: [] }),
      ),
      http.get('/api/v1/billing-circles/unassigned-meters', () => HttpResponse.json([])),
    );
    renderWithRouter(<BillingCirclesAdminPage />);
    expect(await screen.findByText('Musterhof')).toBeInTheDocument();

    const neu = screen.getByRole('button', { name: 'Neuer Abrechnungskreis' });
    const importieren = screen.getByRole('button', { name: 'Stammdaten importieren' });
    const koepfe = [
      screen.getByText('Monatsübersicht', { exact: true }),
      screen.getByText('Kreise', { exact: true }),
      neu,
      importieren,
      screen.getByRole('button', { name: /Nicht abgerechnete Strom-Messstellen/ }),
    ];
    for (let i = 1; i < koepfe.length; i++) {
      // DOCUMENT_POSITION_FOLLOWING: der Kopf steht im Dokument nach seinem Vorgänger.
      expect(
        koepfe[i - 1]!.compareDocumentPosition(koepfe[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    expect(neu).toHaveAttribute('aria-expanded', 'false');
    expect(importieren).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Anlegen' })).not.toBeInTheDocument();

    fireEvent.click(neu);
    expect(neu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Anlegen' })).toBeVisible();
    expect(importieren).toHaveAttribute('aria-expanded', 'false');

    // Eingaben überstehen Ein- und Wiederaufklappen.
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Neuer Hof' } });
    fireEvent.click(neu);
    expect(neu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Anlegen' })).not.toBeInTheDocument();
    fireEvent.click(neu);
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Neuer Hof');
  });
});
