/**
 * Zählerstände zum Monatsende: Tabelle mit Kennzeichnung interpolierter Stände, Befunde,
 * Monatswechsel, Einklappen ohne Befund. Nur fiktive Werte.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { MonthReadingsSection } from './MonthReadingsSection';

function antwort(monat: string) {
  return {
    monat,
    stichtag_alt: '2026-07-31',
    stichtag_neu: '2026-08-31',
    max_abstand_tage: 3,
    positions: [
      {
        position_id: 1,
        label: 'Stall A',
        kind: 'meter',
        measuring_point_id: 5,
        measuring_point_name: 'Stall A',
        serial_numbers: 'TEST-1 / TEST-2',
        transformer_factor: 40,
        stand_alt: {
          wert: '100',
          art: 'abgelesen',
          ablesung_vor: '2026-07-31',
          ablesung_nach: '2026-07-31',
          abstand_tage: 0,
        },
        stand_neu: {
          wert: '160.000',
          art: 'interpoliert',
          ablesung_vor: '2026-08-30',
          ablesung_nach: '2026-09-01',
          abstand_tage: 1,
        },
        korrektur_kwh: '60',
        korrektur_note: 'Zaehlertausch 15.08.2026: TEST-1',
        kwh: '2460.000',
      },
      {
        position_id: 2,
        label: 'Rest',
        kind: 'rest',
        measuring_point_id: null,
        measuring_point_name: null,
        serial_numbers: '',
        transformer_factor: null,
        stand_alt: null,
        stand_neu: null,
        korrektur_kwh: null,
        korrektur_note: null,
        kwh: null,
      },
    ],
    findings: [
      {
        position_id: 1,
        label: 'Stall A',
        code: 'zaehlertausch',
        message: 'Zaehlertausch am 15.08.2026; alter Zaehler als Korrektur.',
      },
    ],
  };
}

describe('MonthReadingsSection', () => {
  it('zeigt Stände, Kennzeichnung, Korrektur und Befunde; lädt bei Monatswechsel neu', async () => {
    const monate: string[] = [];
    server.use(
      http.get('/api/v1/billing-circles/1/readings', ({ request }) => {
        const monat = new URL(request.url).searchParams.get('monat') ?? '';
        monate.push(monat);
        return HttpResponse.json(antwort(monat));
      }),
    );
    renderWithRouter(<MonthReadingsSection circleId={1} tick={0} />);

    // Mit Befund von selbst aufgeklappt.
    const zeile = await screen.findByRole('row', { name: /TEST-1 \/ TEST-2/ });
    expect(zeile).toHaveTextContent('Stall A');
    expect(screen.queryByRole('row', { name: /Rest/ })).not.toBeInTheDocument();
    expect(screen.getByText('interpoliert ±1 T')).toBeInTheDocument();
    expect(screen.getByText('2.460')).toBeInTheDocument();
    expect(screen.getByText('60')).toHaveAttribute('title', 'Zaehlertausch 15.08.2026: TEST-1');
    expect(screen.getByText(/alter Zaehler als Korrektur/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Abrechnungsmonat/), { target: { value: '2026-06' } });
    await waitFor(() => expect(monate).toContain('2026-06'));
  });

  it('bleibt ohne Befund eingeklappt und klappt per Überschrift auf', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/readings', () =>
        HttpResponse.json({ ...antwort('2026-08'), findings: [] }),
      ),
    );
    renderWithRouter(<MonthReadingsSection circleId={1} tick={0} />);
    const kopf = screen.getByRole('button', { name: /Zählerstände zum Monatsende/ });
    await waitFor(() => expect(kopf).toHaveTextContent('in Ordnung'));
    expect(kopf).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('row', { name: /TEST-1/ })).not.toBeInTheDocument();
    fireEvent.click(kopf);
    expect(screen.getByRole('row', { name: /TEST-1/ })).toBeInTheDocument();
  });

  it('bleibt nach manuellem Zuklappen zu, auch wenn neu geladen wird', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/readings', () => HttpResponse.json(antwort('2026-08'))),
    );
    const { rerender } = renderWithRouter(<MonthReadingsSection circleId={1} tick={0} />);
    await screen.findByRole('row', { name: /TEST-1/ });
    fireEvent.click(screen.getByRole('button', { name: /Zählerstände zum Monatsende/ }));
    rerender(<MonthReadingsSection circleId={1} tick={1} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Zählerstände/ })).toHaveTextContent('1 Befund'),
    );
    expect(screen.queryByRole('row', { name: /TEST-1/ })).not.toBeInTheDocument();
  });

  it('zeigt Serverfehler', async () => {
    server.use(
      http.get('/api/v1/billing-circles/1/readings', () =>
        HttpResponse.json({ title: 'Not found', detail: 'Kreis fehlt.' }, { status: 404 }),
      ),
    );
    renderWithRouter(<MonthReadingsSection circleId={1} tick={0} />);
    expect(await screen.findByText('Kreis fehlt.')).toBeInTheDocument();
  });
});
