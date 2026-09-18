/**
 * Verlauf: Monate je Empfänger, Umschalten auf Positionen und auf kWh, leerer Zustand.
 * Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { HistoryCard } from './HistoryCard';

const VERLAUF = {
  monate: ['2026-07', '2026-08'],
  empfaenger: [
    {
      name: 'Muster A KG',
      internal_allocation: false,
      punkte: [
        { monat: '2026-07', version: 1, kwh: '600', eur: '150.00' },
        { monat: '2026-08', version: 2, kwh: '700', eur: '175.00' },
      ],
    },
    {
      name: 'Muster Intern',
      internal_allocation: true,
      punkte: [{ monat: '2026-08', version: 2, kwh: '100', eur: '25.00' }],
    },
  ],
  positionen: [
    {
      name: 'Stall A',
      internal_allocation: false,
      punkte: [{ monat: '2026-08', version: 2, kwh: '500', eur: '125.00' }],
    },
  ],
};

describe('HistoryCard', () => {
  it('zeigt die Monate je Empfänger und wechselt zu Positionen und kWh', async () => {
    server.use(http.get('/api/v1/billing-circles/1/verlauf', () => HttpResponse.json(VERLAUF)));
    renderWithRouter(<HistoryCard circleId={1} />);

    const tabelle = await screen.findByLabelText('Verlauf');
    expect(within(tabelle).getByText('07/26')).toBeInTheDocument();
    expect(within(tabelle).getByText('175,00 €')).toBeInTheDocument();
    expect(within(tabelle).getByText('intern')).toBeInTheDocument();
    // Für den internen Empfänger fehlt der Juli – die Zelle bleibt leer.
    expect(within(tabelle).getAllByText('—')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'kWh' }));
    expect(within(tabelle).getByText('700')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Je Position' }));
    expect(within(tabelle).getByText('Stall A')).toBeInTheDocument();
    expect(within(tabelle).queryByText('Muster A KG')).not.toBeInTheDocument();
  });

  it('sagt es, wenn noch kein Monat festgeschrieben ist', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/verlauf', () =>
        HttpResponse.json({ monate: [], empfaenger: [], positionen: [] }),
      ),
    );
    renderWithRouter(<HistoryCard circleId={1} />);

    expect(await screen.findByText(/Noch kein festgeschriebener Monat/)).toBeInTheDocument();
  });
});
