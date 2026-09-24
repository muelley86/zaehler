/**
 * „Abrechnen an“: Anzeige der Perioden samt aktuellem Wert und Wechsel per
 * POST /change-bill-to.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

import { BillToHistoryCard } from './BillToHistoryCard';

// Die Card liest ausschliesslich mp.id — Minimal-Fixture genuegt.
const MP = { id: 1 } as unknown as MeasuringPointRead;

describe('BillToHistoryCard', () => {
  it('ohne Periode wird an den Eigentümer abgerechnet', async () => {
    server.use(http.get('/api/v1/measuring-points/1/bill-to', () => HttpResponse.json([])));
    renderWithRouter(<BillToHistoryCard mp={MP} />);
    expect(await screen.findByText(/Keine Periode hinterlegt/)).toBeInTheDocument();
    expect(screen.getByText('Eigentümer')).toBeInTheDocument();
  });

  it('zeigt die Perioden mit dem aktiven Wert', async () => {
    server.use(
      http.get('/api/v1/measuring-points/1/bill-to', () =>
        HttpResponse.json([
          { id: 2, bill_to: 'mieter', valid_from: '2026-09-01', valid_to: null },
          { id: 1, bill_to: 'owner', valid_from: '2024-01-01', valid_to: '2026-09-01' },
        ]),
      ),
    );
    renderWithRouter(<BillToHistoryCard mp={MP} />);
    expect(await screen.findByText(/bis 01\.09\.2026/)).toBeInTheDocument();
    // „Aktuell: …“ und die aktive Periode nennen beide den Mieter.
    expect(screen.getAllByText('Mieter (ohne Mieter: Eigentümer)')).toHaveLength(2);
    expect(screen.getAllByText(/^aktiv$/)).toHaveLength(1);
  });

  it('wechselt zum Stichtag auf den Mieter', async () => {
    server.use(http.get('/api/v1/measuring-points/1/bill-to', () => HttpResponse.json([])));
    let body: unknown = null;
    server.use(
      http.post('/api/v1/measuring-points/1/change-bill-to', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({});
      }),
    );
    renderWithRouter(<BillToHistoryCard mp={MP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrechnen an wechseln' }));
    // Vorbelegt mit dem Gegenteil des aktuellen Werts (Eigentümer -> Mieter).
    expect(await screen.findByLabelText(/Künftig abrechnen an/)).toHaveValue('mieter');
    fireEvent.change(screen.getByLabelText(/Wechsel zum/), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^Wechseln$/ }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ bill_to: 'mieter', valid_from: '2026-10-01' });
  });
});
