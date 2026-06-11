/**
 * Tests für System & Backup: Backup-Button zeigt auf das neue ZIP,
 * Restore-Flow Upload → Vorschau → Bestätigung → Commit inkl.
 * Inkompatibilitäts- und Fehlerpfaden.
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { RestorePreviewResponse } from '@/lib/types';

import { SystemAdminPage } from './SystemAdminPage';

const basePreview: RestorePreviewResponse = {
  token: 'tok-1',
  expires_at: '2026-06-11T13:00:00Z',
  manifest: {
    format: 1,
    app_version: '2.55.2',
    alembic_revision: 'abc123',
    created_at: '2026-06-10T08:30:00Z',
    photo_count: 3,
    db_sha256: 'deadbeef',
  },
  db_alembic_revision: 'abc123',
  counts: {
    users: 2,
    measuring_points: 5,
    readings: 120,
    photos_in_db: 3,
    photos_in_zip: 3,
  },
  compatibility: 'ok',
  backup_age_days: 1,
  warnings: ['Das Backup ist 1 Tag(e) alt.'],
};

async function uploadZip(): Promise<void> {
  const user = userEvent.setup();
  const input = screen.getByLabelText('Backup-Datei wählen');
  const file = new File(['zip-bytes'], 'meters-backup.zip', { type: 'application/zip' });
  await user.upload(input, file);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SystemAdminPage', () => {
  it('lädt das Voll-Backup als ZIP', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    renderWithRouter(<SystemAdminPage />, { initialEntries: ['/admin/system'] });

    await user.click(screen.getByRole('button', { name: 'Backup laden' }));
    expect(open).toHaveBeenCalledWith('/api/v1/export/backup.zip', '_blank');
  });

  it('zeigt nach dem Upload die Vorschau mit Inhalt und Warnungen', async () => {
    server.use(http.post('/api/v1/restore/upload', () => HttpResponse.json(basePreview)));
    renderWithRouter(<SystemAdminPage />, { initialEntries: ['/admin/system'] });

    await uploadZip();

    expect(await screen.findByText('Backup-Vorschau')).toBeInTheDocument();
    expect(
      screen.getByText(/5 Messstellen · 120 Ablesungen · 3 Fotos · 2 Benutzer/),
    ).toBeInTheDocument();
    expect(screen.getByText('Das Backup ist 1 Tag(e) alt.')).toBeInTheDocument();
    expect(screen.getByText('2.55.2')).toBeInTheDocument();
  });

  it('deaktiviert das Einspielen bei unbekannter Schema-Revision', async () => {
    server.use(
      http.post('/api/v1/restore/upload', () =>
        HttpResponse.json({ ...basePreview, compatibility: 'unknown_revision' }),
      ),
    );
    renderWithRouter(<SystemAdminPage />, { initialEntries: ['/admin/system'] });

    await uploadZip();

    expect(await screen.findByText(/neueren App-Version/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jetzt wiederherstellen' })).toBeDisabled();
  });

  it('verlangt die Bestätigung und committet dann gegen den Token', async () => {
    let commitUrl: string | null = null;
    server.use(
      http.post('/api/v1/restore/upload', () => HttpResponse.json(basePreview)),
      http.post('/api/v1/restore/:token/commit', ({ request }) => {
        commitUrl = new URL(request.url).pathname;
        return HttpResponse.json({
          migrations_applied: false,
          monthly_cache_recomputed: false,
          relogin_required: false,
          restored: basePreview.counts,
          message: 'Wiederherstellung abgeschlossen.',
        });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<SystemAdminPage />, { initialEntries: ['/admin/system'] });

    await uploadZip();
    const commitButton = await screen.findByRole('button', { name: 'Jetzt wiederherstellen' });
    expect(commitButton).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(commitButton).toBeEnabled();
    await user.click(commitButton);

    expect(await screen.findByText('Wiederherstellung abgeschlossen')).toBeInTheDocument();
    expect(commitUrl).toBe('/api/v1/restore/tok-1/commit');
    // Kein Relogin nötig → Reload-Angebot statt Anmelde-Hinweis.
    expect(screen.getByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
  });

  it('weist nach dem Restore auf die Neuanmeldung hin', async () => {
    server.use(
      http.post('/api/v1/restore/upload', () => HttpResponse.json(basePreview)),
      http.post('/api/v1/restore/:token/commit', () =>
        HttpResponse.json({
          migrations_applied: true,
          monthly_cache_recomputed: true,
          relogin_required: true,
          restored: basePreview.counts,
          message: 'Wiederherstellung abgeschlossen. Bitte neu anmelden.',
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<SystemAdminPage />, { initialEntries: ['/admin/system'] });

    await uploadZip();
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Jetzt wiederherstellen' }));

    expect(
      await screen.findByText(/Anmeldedaten stammen jetzt aus dem Backup/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zur Anmeldung' })).toBeInTheDocument();
  });

  it('zeigt Upload-Fehler als Fehlerbox', async () => {
    server.use(
      http.post('/api/v1/restore/upload', () =>
        HttpResponse.json(
          { title: 'Keine gültige ZIP-Datei', detail: 'Die Datei ist kein lesbares ZIP-Archiv.' },
          { status: 400 },
        ),
      ),
    );
    renderWithRouter(<SystemAdminPage />, { initialEntries: ['/admin/system'] });

    await uploadZip();

    expect(await screen.findByText('Die Datei ist kein lesbares ZIP-Archiv.')).toBeInTheDocument();
  });
});
