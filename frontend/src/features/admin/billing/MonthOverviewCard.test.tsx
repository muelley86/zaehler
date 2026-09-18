/**
 * Monatsübersicht: Status je Kreis und Monat, Verlinkung auf Lauf bzw. Kreis, Verschieben des
 * Zeitraums. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { MonthOverviewCard } from './MonthOverviewCard';
import { monateVerschieben } from './runFormat';

function zelle(monat: string, status: string, run_id: number | null = null) {
  return {
    monat,
    status,
    invoice: status !== 'leer',
    run_id,
    version: run_id === null ? null : 1,
    eur: run_id === null ? null : '250.00',
    empfaenger: run_id === null ? 0 : 2,
    uebertragen: status === 'uebertragen' ? 2 : 0,
    blocking: status === 'entwurf' ? 1 : 0,
  };
}

const UEBERSICHT = {
  von: '2026-07',
  bis: '2026-08',
  monate: ['2026-07', '2026-08'],
  kreise: [
    {
      circle_id: 1,
      code: 'NORD',
      name: 'Musterhof',
      monate: [zelle('2026-07', 'uebertragen', 5), zelle('2026-08', 'entwurf', 7)],
    },
    {
      circle_id: 2,
      code: 'SUED',
      name: 'Musterhof Süd',
      monate: [zelle('2026-07', 'leer'), zelle('2026-08', 'rechnung')],
    },
  ],
};

describe('MonthOverviewCard', () => {
  it('zeigt den Status je Kreis und Monat und verlinkt Lauf bzw. Kreis', async () => {
    server.use(http.get('/api/v1/billing-circles/overview', () => HttpResponse.json(UEBERSICHT)));
    renderWithRouter(<MonthOverviewCard />);

    const tabelle = await screen.findByLabelText('Monatsübersicht');
    expect(within(tabelle).getByText('NORD')).toBeInTheDocument();
    expect(within(tabelle).getByText('SUED')).toBeInTheDocument();

    // Übertragener Juli führt zum Lauf, leerer Juli zum Kreis.
    const juli = screen.getByLabelText(/NORD 07\/26: nach Agrarmonitor übertragen/);
    expect(juli).toHaveAttribute('href', '/admin/abrechnungskreise/1/laeufe/5');
    expect(juli).toHaveTextContent('Ü');
    const august = screen.getByLabelText(/NORD 08\/26: Entwurf/);
    expect(august).toHaveAttribute('href', '/admin/abrechnungskreise/1/laeufe/7');
    expect(august).toHaveAccessibleName(/1 blockierende Befunde/);
    // Ohne Lauf führt die Zelle in den Assistenten – mit dem Monat der Zelle.
    const leer = screen.getByLabelText(/SUED 07\/26: nichts erfasst/);
    expect(leer).toHaveAttribute('href', '/admin/abrechnungskreise/2/assistent?monat=2026-07');
  });

  it('verschiebt den Zeitraum um ein Jahr', async () => {
    const gefragt: string[] = [];
    server.use(
      http.get('/api/v1/billing-circles/overview', ({ request }) => {
        gefragt.push(new URL(request.url).search);
        return HttpResponse.json(UEBERSICHT);
      }),
    );
    renderWithRouter(<MonthOverviewCard />);

    await screen.findByLabelText('Monatsübersicht');
    expect(gefragt).toEqual(['']); // erster Aufruf ohne Zeitraum: Standard des Servers

    fireEvent.click(screen.getByRole('button', { name: /Früher/ }));
    await waitFor(() => expect(gefragt).toHaveLength(2));
    expect(gefragt[1]).toBe('?von=2025-07&bis=2025-08');
  });

  it('meldet einen Ladefehler statt einer leeren Tabelle', async () => {
    server.use(
      http.get('/api/v1/billing-circles/overview', () =>
        HttpResponse.json(
          { title: 'Period too long', detail: 'Zu großer Zeitraum.' },
          { status: 422 },
        ),
      ),
    );
    renderWithRouter(<MonthOverviewCard />);

    expect(await screen.findByText(/Zu großer Zeitraum\./)).toBeInTheDocument();
    expect(screen.queryByLabelText('Monatsübersicht')).not.toBeInTheDocument();
  });

  it('sagt es, wenn es noch keine Kreise gibt', async () => {
    server.use(
      http.get('/api/v1/billing-circles/overview', () =>
        HttpResponse.json({ ...UEBERSICHT, kreise: [] }),
      ),
    );
    renderWithRouter(<MonthOverviewCard />);

    expect(await screen.findByText('Noch keine Abrechnungskreise.')).toBeInTheDocument();
  });

  it('rechnet den Zeitraum über den Jahreswechsel richtig', () => {
    expect(monateVerschieben('2026-01', '2026-12', -12)).toEqual(['2025-01', '2025-12']);
    expect(monateVerschieben('2025-12', '2026-01', 12)).toEqual(['2026-12', '2027-01']);
  });
});
