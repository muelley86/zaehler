/**
 * Nicht abgerechnete Strom-Messstellen: Liste mit Link, Stichtagswechsel lädt neu, Erfolgsmeldung
 * wenn alles abgerechnet ist. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { UnassignedMetersCard } from './UnassignedMetersCard';

describe('UnassignedMetersCard', () => {
  it('listet offene Messstellen und lädt bei neuem Stichtag nach', async () => {
    const stichtage: string[] = [];
    server.use(
      http.get('/api/v1/billing-circles/unassigned-meters', ({ request }) => {
        const tag = new URL(request.url).searchParams.get('stichtag') ?? '';
        stichtage.push(tag);
        return HttpResponse.json(
          tag === '2026-07-31'
            ? [
                { id: 5, name: 'Stall A', serial_numbers: 'TEST-1' },
                { id: 6, name: 'Pumpe', serial_numbers: 'TEST-2' },
              ]
            : [{ id: 5, name: 'Stall A', serial_numbers: 'TEST-1' }],
        );
      }),
    );
    renderWithRouter(<UnassignedMetersCard />);

    const toggle = await screen.findByRole('button', { name: /Nicht abgerechnete.*1/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Stall A' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const link = await screen.findByRole('link', { name: 'Stall A' });
    expect(link).toHaveAttribute('href', '/admin/messstellen/5');
    expect(screen.getByText('TEST-1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Stichtag/), { target: { value: '2026-07-31' } });
    expect(await screen.findByRole('link', { name: 'Pumpe' })).toBeInTheDocument();
    await waitFor(() => expect(stichtage).toContain('2026-07-31'));
  });

  it('zeigt einen Serverfehler', async () => {
    server.use(
      http.get('/api/v1/billing-circles/unassigned-meters', () =>
        HttpResponse.json(
          { title: 'Boom', detail: 'Datenbank nicht erreichbar.' },
          { status: 500 },
        ),
      ),
    );
    renderWithRouter(<UnassignedMetersCard />);
    expect(await screen.findByText('Datenbank nicht erreichbar.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nicht abgerechnete Messstellen')).not.toBeInTheDocument();
  });

  it('meldet, wenn alle Messstellen abgerechnet werden', async () => {
    server.use(http.get('/api/v1/billing-circles/unassigned-meters', () => HttpResponse.json([])));
    renderWithRouter(<UnassignedMetersCard />);
    expect(
      await screen.findByText('Alle Strom-Messstellen mit Zähler werden abgerechnet.'),
    ).toBeInTheDocument();
  });
});
