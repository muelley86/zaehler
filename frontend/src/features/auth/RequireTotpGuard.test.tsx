/**
 * Guard-Test: Ein Admin ohne 2FA (must_setup_totp=true) wird vom App-Router
 * auf die erzwungene 2FA-Einrichtung umgeleitet — egal welche Route er
 * ansteuert. Spiegelt das Backend-Gate (api/deps.py) auf der UX-Ebene.
 */

import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/tests/server';

const { mockMe } = vi.hoisted(() => ({
  mockMe: {
    id: 1,
    username: 'admin',
    email: null,
    role: 'admin' as const,
    is_active: true,
    force_password_change: false,
    totp_enabled: false,
    can_assign_qr_tokens: false,
    last_login_at: null,
    must_setup_totp: true,
  },
}));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: mockMe,
    loading: false,
    login: vi.fn(),
    verifyTotp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Nach dem vi.mock importieren, damit App die gemockte useAuth nutzt.
import { App } from '@/App';

describe('App — Admin-2FA-Pflicht-Guard', () => {
  it('leitet einen Admin ohne 2FA auf jede Route zur erzwungenen Einrichtung um', async () => {
    server.use(
      http.get('/api/v1/auth/2fa/status', () =>
        HttpResponse.json({ enabled: false, backup_codes_remaining: 0 }),
      ),
    );

    render(
      <MemoryRouter initialEntries={['/erfassungen']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Zwei-Faktor-Authentisierung erforderlich/i),
    ).toBeInTheDocument();
    // Die eigentliche Zielseite (Erfassungen) darf NICHT gerendert sein.
    expect(screen.queryByText(/Erfassungen/i)).not.toBeInTheDocument();
  });
});
