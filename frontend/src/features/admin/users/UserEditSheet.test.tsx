/**
 * Tests fuer UserEditSheet:
 *  - Rollen-Aenderung sendet PATCH
 *  - Loeschen mit Confirm sendet DELETE
 *  - Bei eigenem Konto: Rolle/Aktiv/Loeschen disabled, Self-Hint sichtbar
 *  - 409 mit `references` wird benutzerfreundlich aufbereitet
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { Me, UserRead } from '@/lib/types';

import { UserEditSheet } from './UserEditSheet';

const _RECORDER: UserRead = {
  id: 5,
  username: 'recorder1',
  email: null,
  role: 'recorder',
  is_active: true,
  force_password_change: false,
  totp_enabled: false,
  can_assign_qr_tokens: false,
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const _ADMIN_ME: Me = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  role: 'admin',
  is_active: true,
  force_password_change: false,
  totp_enabled: false,
  can_assign_qr_tokens: false,
  last_login_at: null,
};

describe('UserEditSheet', () => {
  it('schickt PATCH mit nur den geaenderten Feldern (Rolle)', async () => {
    let patchBody: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v1/users/:id', async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ..._RECORDER, role: 'admin' });
      }),
    );

    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(
      <UserEditSheet user={_RECORDER} me={_ADMIN_ME} onClose={onClose} onSaved={onSaved} />,
    );

    const roleSelect = screen.getByTestId('user-edit-role-select');
    await user.selectOptions(roleSelect, 'admin');
    await user.click(screen.getByRole('button', { name: /^Speichern$/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(patchBody).toEqual({ role: 'admin' });
  });

  it('Loeschen mit Confirm schickt DELETE und schliesst das Sheet', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleteHit = false;
    server.use(
      http.delete('/api/v1/users/:id', () => {
        deleteHit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(
      <UserEditSheet user={_RECORDER} me={_ADMIN_ME} onClose={onClose} onSaved={onSaved} />,
    );

    await user.click(screen.getByTestId('user-edit-delete'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteHit).toBe(true);
    expect(onClose).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Loeschen ohne Confirm sendet kein DELETE', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deleteHit = false;
    server.use(
      http.delete('/api/v1/users/:id', () => {
        deleteHit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithRouter(
      <UserEditSheet user={_RECORDER} me={_ADMIN_ME} onClose={() => {}} onSaved={() => {}} />,
    );
    await user.click(screen.getByTestId('user-edit-delete'));

    expect(deleteHit).toBe(false);
    confirmSpy.mockRestore();
  });

  it('zeigt benutzerfreundliche Fehlermeldung bei 409 mit references', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.delete('/api/v1/users/:id', () =>
        HttpResponse.json(
          {
            title: 'User has data references',
            status: 409,
            detail: 'Benutzer hat noch Daten.',
            references: { readings: 3, deliveries: 1, granted_accesses: 0 },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(
      <UserEditSheet user={_RECORDER} me={_ADMIN_ME} onClose={() => {}} onSaved={() => {}} />,
    );
    await user.click(screen.getByTestId('user-edit-delete'));

    await waitFor(() => {
      const errEl = screen.getByTestId('user-edit-error');
      expect(errEl).toHaveTextContent(/3 Erfassungen/);
      expect(errEl).toHaveTextContent(/1 Lieferungen/);
      expect(errEl).toHaveTextContent(/deaktivieren/);
    });
    confirmSpy.mockRestore();
  });

  it('Bei eigenem Konto sind Rolle, Aktiv-Switch und Loeschen disabled', () => {
    const selfAsAdmin: UserRead = {
      ..._ADMIN_ME,
      created_at: '2024-01-01T00:00:00Z',
    };
    renderWithRouter(
      <UserEditSheet user={selfAsAdmin} me={_ADMIN_ME} onClose={() => {}} onSaved={() => {}} />,
    );

    expect(screen.getByTestId('user-edit-self-hint')).toBeInTheDocument();
    expect(screen.getByTestId('user-edit-role-select')).toBeDisabled();
    expect(screen.getByTestId('user-edit-delete')).toBeDisabled();
  });
});
