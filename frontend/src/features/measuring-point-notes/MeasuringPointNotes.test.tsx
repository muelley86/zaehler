import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointNoteRead } from '@/lib/types';

import { MeasuringPointNotes } from './MeasuringPointNotes';

// Recorder mit id 2: darf eigene Notizen löschen, fremde nicht.
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 2, username: 'recorder', role: 'recorder', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const _own: MeasuringPointNoteRead = {
  id: 11,
  measuring_point_id: 1,
  text: 'Schlüssel beim Hausmeister',
  created_at: '2026-09-20T08:30:00Z',
  created_by_user_id: 2,
  created_by_username: 'recorder',
};

const _foreign: MeasuringPointNoteRead = {
  id: 10,
  measuring_point_id: 1,
  text: 'Zähler hinter dem Regal',
  created_at: '2026-09-19T08:30:00Z',
  created_by_user_id: 1,
  created_by_username: 'admin',
};

const PLACEHOLDER = 'Notiz zur Messstelle …';

describe('MeasuringPointNotes', () => {
  it('zeigt Notizen mit Autor und Löschbutton nur für eigene', async () => {
    server.use(
      http.get('/api/v1/measuring-points/1/notes', () => HttpResponse.json([_own, _foreign])),
    );
    renderWithRouter(<MeasuringPointNotes mpId={1} variant="card" />);

    expect(await screen.findByText('Schlüssel beim Hausmeister')).toBeInTheDocument();
    expect(screen.getByText('Zähler hinter dem Regal')).toBeInTheDocument();
    expect(screen.getByText(/^admin ·/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Notiz löschen' })).toHaveLength(1);
  });

  it('legt eine Notiz an und zählt die Zeichen', async () => {
    let posted: unknown = null;
    server.use(
      http.get('/api/v1/measuring-points/1/notes', () => HttpResponse.json([])),
      http.post('/api/v1/measuring-points/1/notes', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ ..._own, text: 'Neu' }, { status: 201 });
      }),
    );
    renderWithRouter(<MeasuringPointNotes mpId={1} variant="card" />);

    const textarea = await screen.findByPlaceholderText(PLACEHOLDER);
    expect(textarea).toHaveAttribute('maxLength', '500');
    fireEvent.change(textarea, { target: { value: 'Neu' } });
    expect(screen.getByText('3/500')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));

    await waitFor(() => expect(posted).toEqual({ text: 'Neu' }));
    expect(await screen.findByText('Neu')).toBeInTheDocument();
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });

  it('bleibt in der Kompaktansicht leer, wenn das Laden fehlschlägt', async () => {
    let requested = false;
    server.use(
      http.get('/api/v1/measuring-points/1/notes', () => {
        requested = true;
        return HttpResponse.error();
      }),
    );
    renderWithRouter(<MeasuringPointNotes mpId={1} variant="compact" />);
    await waitFor(() => expect(requested).toBe(true));
    expect(screen.queryByTestId('mp-notes-compact')).not.toBeInTheDocument();
  });

  it('Kompaktansicht klappt das Formular erst auf Klick auf', async () => {
    server.use(http.get('/api/v1/measuring-points/1/notes', () => HttpResponse.json([_foreign])));
    renderWithRouter(<MeasuringPointNotes mpId={1} variant="compact" />);

    expect(await screen.findByText('Zähler hinter dem Regal')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notiz hinzufügen' }));
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });
});
