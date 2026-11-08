/**
 * Backup-Codes neu generieren verlangt Re-Authentisierung (Passwort +
 * 2FA-/Backup-Code) — ein entwendetes Session-Cookie allein reicht nicht.
 */

import { http, HttpResponse } from 'msw';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/tests/server';
import { TwoFactorSection } from './TwoFactorSection';

const refresh = vi.fn().mockResolvedValue(undefined);

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: {
      id: 1,
      username: 'admin',
      email: null,
      role: 'admin' as const,
      is_active: true,
      force_password_change: false,
      totp_enabled: true,
      can_assign_qr_tokens: false,
      can_billing: false,
      last_login_at: null,
    },
    refresh,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

describe('TwoFactorSection — Backup-Codes neu generieren', () => {
  it('sendet Passwort und Code und zeigt danach die neuen Codes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: unknown = null;
    server.use(
      http.get('/api/v1/auth/2fa/status', () =>
        HttpResponse.json({ enabled: true, backup_codes_remaining: 3 }),
      ),
      http.post('/api/v1/auth/2fa/backup-codes/regenerate', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ backup_codes: ['aaaa-bbbb-cccc-dddd'] });
      }),
    );

    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByText('Backup-Codes neu generieren'));
    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), {
      target: { value: 'geheim-12345' },
    });
    fireEvent.change(screen.getByLabelText('2FA-Code oder Backup-Code'), {
      target: { value: ' 123456 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Neu generieren' }));

    expect(await screen.findByText('aaaa-bbbb-cccc-dddd')).toBeInTheDocument();
    expect(body).toEqual({ current_password: 'geheim-12345', code: '123456' });
  });

  it('zeigt den Fehler des Servers bei falschem Code', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.get('/api/v1/auth/2fa/status', () =>
        HttpResponse.json({ enabled: true, backup_codes_remaining: 3 }),
      ),
      http.post('/api/v1/auth/2fa/backup-codes/regenerate', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Invalid TOTP / backup code', status: 400 },
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByText('Backup-Codes neu generieren'));
    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('2FA-Code oder Backup-Code'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Neu generieren' }));

    expect(await screen.findByText('Invalid TOTP / backup code')).toBeInTheDocument();
  });
});
