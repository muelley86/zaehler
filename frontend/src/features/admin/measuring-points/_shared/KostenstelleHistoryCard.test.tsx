/**
 * Kostenstellen-Historie: Anzeige der Perioden, Wechsel per POST /change-kostenstelle
 * und Client-Validierung des Zahlenfelds.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

import { KostenstelleHistoryCard } from './KostenstelleHistoryCard';

// Die Card liest ausschliesslich mp.id — Minimal-Fixture genuegt.
const MP = { id: 1 } as unknown as MeasuringPointRead;

function mockHistory() {
  server.use(
    http.get('/api/v1/measuring-points/1/kostenstellen', () =>
      HttpResponse.json([
        { id: 2, kostenstelle: 98860, valid_from: '2026-09-01', valid_to: null },
        { id: 1, kostenstelle: 10111, valid_from: '2024-01-01', valid_to: '2026-09-01' },
      ]),
    ),
  );
}

describe('KostenstelleHistoryCard', () => {
  it('zeigt die Perioden mit aktiver Kostenstelle', async () => {
    mockHistory();
    renderWithRouter(<KostenstelleHistoryCard mp={MP} onChanged={() => {}} />);
    expect(await screen.findByText('98860')).toBeInTheDocument();
    expect(screen.getByText('10111')).toBeInTheDocument();
    expect(screen.getByText(/bis 01\.09\.2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/^aktiv$/)).toHaveLength(1);
  });

  it('wechselt die Kostenstelle zum Stichtag', async () => {
    mockHistory();
    let body: unknown = null;
    server.use(
      http.post('/api/v1/measuring-points/1/change-kostenstelle', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({});
      }),
    );
    renderWithRouter(<KostenstelleHistoryCard mp={MP} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Kostenstelle wechseln/ }));
    fireEvent.change(await screen.findByLabelText(/Neue Kostenstelle/), {
      target: { value: '98870' },
    });
    fireEvent.change(screen.getByLabelText(/Wechsel zum/), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^Wechseln$/ }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ kostenstelle: 98870, valid_from: '2026-10-01' });
  });

  it('lehnt eine ungültige Kostenstelle ohne Request ab', async () => {
    mockHistory();
    let called = false;
    server.use(
      http.post('/api/v1/measuring-points/1/change-kostenstelle', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithRouter(<KostenstelleHistoryCard mp={MP} onChanged={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Kostenstelle wechseln/ }));
    fireEvent.change(await screen.findByLabelText(/Neue Kostenstelle/), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Wechseln$/ }));
    expect(await screen.findByText(/Ganzzahl von 0 bis 99999/)).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
