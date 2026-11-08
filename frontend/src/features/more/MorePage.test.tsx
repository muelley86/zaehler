/**
 * Test fuer den „Filter merken"-Schalter auf der Mehr-Seite. `useAuth` und die
 * `TwoFactorSection` (macht Mount-API-Calls) werden gemockt — Fokus liegt allein
 * auf der Verdrahtung des Switches mit dem FilterPrefs-Context.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '@/tests/render';
import { MorePage } from './MorePage';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { username: 'admin', role: 'admin', email: null }, logout }),
}));
vi.mock('@/features/auth/TwoFactorSection', () => ({ TwoFactorSection: () => null }));

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  logout.mockReset();
});

describe('MorePage — Filter merken', () => {
  it('schaltet die Praeferenz um und persistiert sie dauerhaft', () => {
    renderWithRouter(<MorePage />);

    const sw = screen.getByRole('switch', { name: 'Filter merken' });
    expect(sw).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(sw);

    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('filters.remember')).toBe('1');
  });
});

describe('MorePage — Abmelden', () => {
  it('meldet einen fehlgeschlagenen Logout statt still Erfolg vorzutäuschen', async () => {
    logout.mockRejectedValue(new Error('Netzwerkfehler'));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderWithRouter(<MorePage />);

    fireEvent.click(screen.getByText('Abmelden'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(expect.stringContaining('Abmelden fehlgeschlagen')),
    );
  });
});
