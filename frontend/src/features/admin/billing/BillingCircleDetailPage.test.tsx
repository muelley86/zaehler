/**
 * Abrechnungskreis-Detail: Positionen, Prüfbericht mit Befunden und Anlegen einer Restposition.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

import { BillingCircleDetailPage } from './BillingCircleDetailPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const params = { id: '1' };
  const navigate = vi.fn();
  return { ...actual, useParams: () => params, useNavigate: () => navigate };
});

function mockApi() {
  server.use(
    http.get('/api/v1/billing-circles/1', () =>
      HttpResponse.json({
        id: 1,
        code: 'SUED',
        name: 'Musterhof Nord',
        rechnungsleger: 'Musterhof Holding GmbH',
        abnahmestelle: 'AID-000002',
        marktlokation: null,
        note: null,
      }),
    ),
    http.get('/api/v1/billing-circles/1/positions', () =>
      HttpResponse.json([
        {
          id: 10,
          circle_id: 1,
          sort_order: 0,
          label: 'Pumpe',
          kind: 'meter',
          measuring_point_id: 5,
          measuring_point_name: 'SUED - Pumpe',
          parent_position_id: null,
          owner_id: null,
          owner_name: null,
          recipient_name: 'Nord KG',
          recipient_internal: false,
          kostenstelle: null,
          invoice_line: null,
          note: null,
          valid_from: '2026-08-01',
          valid_to: null,
        },
      ]),
    ),
    http.get('/api/v1/billing-circles/1/invoices', () => HttpResponse.json([])),
    http.get('/api/v1/billing-circles/1/runs', () => HttpResponse.json([])),
    http.get('/api/v1/billing-circles/1/readings', () =>
      HttpResponse.json({
        monat: '2026-08',
        stichtag_alt: '2026-07-31',
        stichtag_neu: '2026-08-31',
        max_abstand_tage: 3,
        positions: [],
        findings: [],
      }),
    ),
    http.get('/api/v1/billing-circles/1/check', () =>
      HttpResponse.json({
        stichtag: '2026-08-31',
        positions: [
          {
            position_id: 10,
            label: 'Pumpe',
            kind: 'meter',
            measuring_point_id: 5,
            measuring_point_name: 'SUED - Pumpe',
            parent_position_id: null,
            owner_id: null,
            owner_name: null,
            internal_allocation: false,
            kostenstelle: 10108,
            mieter_name: null,
            invoice_line: 'Strom (gewerblich) Kostenstelle 10108',
          },
        ],
        findings: [
          {
            position_id: 10,
            label: 'Pumpe',
            code: 'ohne_eigentuemer',
            message: 'Kein Eigentuemer (Empfaenger) zum Stichtag.',
          },
        ],
      }),
    ),
    http.get('/api/v1/measuring-points', () => HttpResponse.json([])),
    http.get('/api/v1/owners', () =>
      HttpResponse.json([{ id: 3, name: 'Nord KG', internal_allocation: false }]),
    ),
  );
}

describe('BillingCircleDetailPage', () => {
  it('zeigt Positionen, aufgelöste Rechnungszeile und Befunde', async () => {
    mockApi();
    renderWithRouter(<BillingCircleDetailPage />);
    expect(await screen.findByText('SUED – Musterhof Nord')).toBeInTheDocument();
    expect(await screen.findByText(/Messstelle: SUED - Pumpe/)).toBeInTheDocument();
    expect(await screen.findByText('Strom (gewerblich) Kostenstelle 10108')).toBeInTheDocument();
    expect(screen.getByText(/Kein Eigentuemer/)).toBeInTheDocument();
  });

  it('gruppiert nach Empfänger mit Griffen statt Reihenfolge-Nummer', async () => {
    mockApi();
    renderWithRouter(<BillingCircleDetailPage />);
    expect(await screen.findByRole('group', { name: 'Empfänger „Nord KG“' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Empfänger „Nord KG“ verschieben' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Position „Pumpe“ verschieben' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Position Pumpe bearbeiten' }));
    expect(await screen.findByLabelText('Bezeichnung')).toHaveValue('Pumpe');
    expect(screen.queryByLabelText('Reihenfolge')).not.toBeInTheDocument();
  });

  it('legt eine Restposition mit Empfänger und Kostenstelle an', async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.post('/api/v1/billing-circles/1/positions', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithRouter(<BillingCircleDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Position hinzufügen/ }));
    fireEvent.change(await screen.findByLabelText('Bezeichnung'), { target: { value: 'Rest' } });
    fireEvent.change(screen.getByLabelText('Art'), { target: { value: 'rest' } });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Nord KG' })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Empfänger'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Kostenstelle'), { target: { value: '10101' } });
    fireEvent.change(screen.getByLabelText('Gültig ab'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^Speichern$/ }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      label: 'Rest',
      kind: 'rest',
      owner_id: 3,
      kostenstelle: 10101,
      measuring_point_id: null,
      valid_from: '2026-08-01',
      valid_to: null,
    });
  });
});
