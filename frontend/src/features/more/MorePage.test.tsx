/**
 * Test fuer den „Filter merken"-Schalter auf der Mehr-Seite. `useAuth` und die
 * `TwoFactorSection` (macht Mount-API-Calls) werden gemockt — Fokus liegt allein
 * auf der Verdrahtung des Switches mit dem FilterPrefs-Context.
 */

import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '@/tests/render';
import { MorePage } from './MorePage';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { username: 'admin', role: 'admin', email: null }, logout: vi.fn() }),
}));
vi.mock('@/features/auth/TwoFactorSection', () => ({ TwoFactorSection: () => null }));

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
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
