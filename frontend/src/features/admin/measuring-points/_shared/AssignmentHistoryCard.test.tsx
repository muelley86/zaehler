/**
 * Sichert das config-getriebene Verhalten der generischen AssignmentHistoryCard:
 * pro Ressource der richtige Endpoint (owners/mieters) und Body-Key
 * (owner_id/mieter_id). Owner + Mieter decken die beiden abweichenden Master-
 * Formen (name vs display_name) und Feld-Keys ab.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead } from '@/lib/types';

import {
  AssignmentHistoryCard,
  MIETER_ASSIGNMENT_CONFIG,
  OWNER_ASSIGNMENT_CONFIG,
  type AssignmentHistoryConfig,
} from './AssignmentHistoryCard';

// Die Card liest ausschliesslich mp.id — Minimal-Fixture genuegt.
const MP = { id: 1 } as unknown as MeasuringPointRead;

interface Case {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: AssignmentHistoryConfig<any, any>;
  master: Record<string, unknown>;
  historyEntry: Record<string, unknown>;
  historyName: string;
  masterLabel: string;
  idField: string;
}

const CASES: Case[] = [
  {
    name: 'Owner',
    config: OWNER_ASSIGNMENT_CONFIG,
    master: { id: 10, name: 'Neu AG' },
    historyEntry: {
      id: 5,
      owner_id: 3,
      owner_name: 'Alt GmbH',
      valid_from: '2024-01-01',
      valid_to: null,
    },
    historyName: 'Alt GmbH',
    masterLabel: 'Neu AG',
    idField: 'owner_id',
  },
  {
    name: 'Mieter',
    config: MIETER_ASSIGNMENT_CONFIG,
    master: { id: 10, first_name: 'Max', last_name: 'Mustermann', display_name: 'Mustermann, Max' },
    historyEntry: {
      id: 5,
      mieter_id: 3,
      mieter_name: 'Schmidt, Anna',
      valid_from: '2024-01-01',
      valid_to: null,
    },
    historyName: 'Schmidt, Anna',
    masterLabel: 'Mustermann, Max',
    idField: 'mieter_id',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssignmentHistoryCard — config-getriebene Mutation', () => {
  it.each(CASES)('$name: Periode anlegen postet auf den richtigen Endpoint', async (c) => {
    let postedUrl: string | null = null;
    let postedBody: Record<string, unknown> | null = null;
    server.use(
      http.get(`/api/v1/measuring-points/1/${c.config.resource}`, () =>
        HttpResponse.json([c.historyEntry]),
      ),
      http.get(`/api/v1/${c.config.masterResource}`, () => HttpResponse.json([c.master])),
      http.post(`/api/v1/measuring-points/1/${c.config.resource}`, async ({ request }) => {
        postedUrl = new URL(request.url).pathname;
        postedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 99 }, { status: 201 });
      }),
    );

    renderWithRouter(<AssignmentHistoryCard mp={MP} onChanged={vi.fn()} config={c.config} />);

    // Bestehende Periode wird angezeigt (Getter/Labels wirken).
    expect(await screen.findByText(c.historyName)).toBeInTheDocument();
    expect(screen.getByText(c.config.labels.historyHeader)).toBeInTheDocument();

    // Warten, bis die Master-Liste geladen ist (Button sonst disabled).
    const addBtn = screen.getByText(c.config.labels.addPeriodButton);
    await waitFor(() => expect(addBtn).not.toBeDisabled());
    fireEvent.click(addBtn);

    // Durchsuchbares Dropdown: öffnen, filtern, Option wählen.
    fireEvent.click(screen.getByRole('button', { name: /bitte wählen/ }));
    fireEvent.change(screen.getByPlaceholderText('Suchen…'), {
      target: { value: c.masterLabel.slice(0, 3) },
    });
    fireEvent.click(screen.getByRole('button', { name: c.masterLabel }));
    fireEvent.change(screen.getByLabelText('Gültig ab'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedUrl).toBe(`/api/v1/measuring-points/1/${c.config.resource}`);
    expect(postedBody).toEqual({
      [c.idField]: 10,
      valid_from: '2025-01-01',
      valid_to: null,
    });
  });
});

describe('AssignmentHistoryCard — Mieter im Wechsel-Sheet anlegen', () => {
  it('legt eine Firma an, wählt sie aus und wechselt auf sie', async () => {
    let createdBody: Record<string, unknown> | null = null;
    let changeBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/v1/measuring-points/1/mieters', () => HttpResponse.json([])),
      // Noch kein Mieter vorhanden — der Wechsel muss trotzdem möglich sein.
      http.get('/api/v1/mieters', () => HttpResponse.json([])),
      http.post('/api/v1/mieters', async ({ request }) => {
        createdBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: 42,
            is_company: true,
            first_name: null,
            last_name: 'Gewerbe GmbH',
            display_name: 'Gewerbe GmbH',
            address_street: null,
            address_postcode: null,
            address_city: null,
            email: null,
            phone: null,
            note: null,
          },
          { status: 201 },
        );
      }),
      http.post('/api/v1/measuring-points/1/change-mieter', async ({ request }) => {
        changeBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1 });
      }),
    );

    renderWithRouter(
      <AssignmentHistoryCard mp={MP} onChanged={vi.fn()} config={MIETER_ASSIGNMENT_CONFIG} />,
    );

    const changeBtn = await screen.findByRole('button', { name: 'Mieter wechseln' });
    expect(changeBtn).not.toBeDisabled();
    fireEvent.click(changeBtn);
    fireEvent.change(screen.getByLabelText('Wechsel zum'), { target: { value: '2025-04-01' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Neuen Mieter anlegen' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Firma' }));
    expect(screen.queryByLabelText('Vorname (optional)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Firmenname'), { target: { value: 'Gewerbe GmbH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    // Zurück im Wechsel-Formular: neue Firma ausgewählt, Datum erhalten.
    expect(await screen.findByRole('button', { name: /Gewerbe GmbH/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Wechsel zum')).toHaveValue('2025-04-01');
    expect(createdBody).toMatchObject({
      is_company: true,
      first_name: null,
      last_name: 'Gewerbe GmbH',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wechseln' }));
    await waitFor(() => expect(changeBody).not.toBeNull());
    expect(changeBody).toEqual({ mieter_id: 42, valid_from: '2025-04-01' });
  });

  it('Eigentümer ohne Stammdaten bleiben gesperrt (keine Neuanlage)', async () => {
    server.use(
      http.get('/api/v1/measuring-points/1/owners', () => HttpResponse.json([])),
      http.get('/api/v1/owners', () => HttpResponse.json([])),
    );
    renderWithRouter(
      <AssignmentHistoryCard mp={MP} onChanged={vi.fn()} config={OWNER_ASSIGNMENT_CONFIG} />,
    );
    await screen.findByText(OWNER_ASSIGNMENT_CONFIG.labels.emptyText);
    expect(screen.getByRole('button', { name: 'Eigentümer wechseln' })).toBeDisabled();
  });
});
