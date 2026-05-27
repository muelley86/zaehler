/**
 * Test fuer den Versions-Indikator im Sidebar-Footer.
 *
 * Vite injiziert ``__APP_VERSION__`` zur Build-Zeit aus
 * ``.release-please-manifest.json``. In Tests wird derselbe Mechanismus
 * via ``vite.config.ts::define`` verwendet, sodass das Symbol auch in
 * jsdom verfuegbar ist.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';

import { AppShell } from './AppShell';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    me: { id: 1, username: 'admin', role: 'admin', is_active: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('AppShell', () => {
  it('zeigt den Versions-Indikator im Sidebar-Footer', () => {
    renderWithRouter(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const versionEl = screen.getByTestId('sidebar-version');
    expect(versionEl).toBeInTheDocument();
    // Muss mit "v" beginnen — kann "vdev" im Test-Setup oder eine echte
    // Versionsnummer sein. Wir verlassen uns nicht auf die genaue Form.
    expect(versionEl.textContent).toMatch(/^v\S+/);
  });
});
