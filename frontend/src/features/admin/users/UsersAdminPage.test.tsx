/**
 * Test für „Filter merken" auf der Benutzer-Admin-Liste: der Rollen-Filter
 * (Alle/Admins/Erfasser/Inaktiv) wird bei aktiver Option je Seite in
 * sessionStorage gespiegelt; bei deaktivierter Option nicht (Regressions-Guard).
 */

import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { UsersAdminPage } from './UsersAdminPage';

function _mockUsers() {
  server.use(http.get('/api/v1/users', () => HttpResponse.json([])));
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('UsersAdminPage — Rollen-Filter', () => {
  it('merkt den Filter in sessionStorage, wenn „Filter merken" aktiv ist', async () => {
    window.localStorage.setItem('filters.remember', '1');
    _mockUsers();
    const user = userEvent.setup();
    renderWithRouter(<UsersAdminPage />);

    await user.click(await screen.findByRole('button', { name: /Erfasser/ }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.adminUsers.filter')).toBe('recorder'),
    );
  });

  it('persistiert nichts, wenn „Filter merken" aus ist (Default)', async () => {
    _mockUsers();
    const user = userEvent.setup();
    renderWithRouter(<UsersAdminPage />);

    const pill = await screen.findByRole('button', { name: /Erfasser/ });
    await user.click(pill);

    expect(pill).toHaveAttribute('aria-pressed', 'true'); // Filter wirkt
    expect(window.sessionStorage.getItem('filters.adminUsers.filter')).toBeNull();
  });
});
