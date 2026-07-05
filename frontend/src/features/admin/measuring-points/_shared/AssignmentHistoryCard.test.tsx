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

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
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
