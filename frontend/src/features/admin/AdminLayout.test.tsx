/**
 * Smoke-Tests fuer das AdminLayout.
 *
 * Wir validieren zwei Behauptungen:
 *  - Die Sub-Sidebar enthaelt alle 8 Admin-Sektionen plus den Übersicht-Eintrag.
 *  - Bei Aufruf von ``/admin/benutzer`` markiert react-router den korrekten
 *    NavLink mit ``aria-current="page"``.
 */

import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';

import { AdminLayout } from './AdminLayout';
import { ADMIN_SECTIONS } from './adminNav';

function StubPage({ name }: { name: string }) {
  return <div data-testid={`stub-${name}`}>{name}</div>;
}

function harness() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<StubPage name="hub" />} />
        <Route path="messstellen" element={<StubPage name="messstellen" />} />
        <Route path="benutzer" element={<StubPage name="benutzer" />} />
      </Route>
    </Routes>
  );
}

describe('AdminLayout', () => {
  it('listet alle Admin-Sektionen plus Übersicht in der Sub-Sidebar', () => {
    renderWithRouter(harness(), { initialEntries: ['/admin'] });
    const sidebar = screen.getByTestId('admin-sub-sidebar');
    expect(sidebar).toBeInTheDocument();
    // Übersicht (Hub) + 8 Sektionen
    for (const s of ADMIN_SECTIONS) {
      expect(sidebar.querySelector(`a[href="${s.to}"]`)).not.toBeNull();
    }
    expect(sidebar.querySelector('a[href="/admin"]')).not.toBeNull();
  });

  it('markiert den aktiven Sub-NavLink', () => {
    renderWithRouter(harness(), { initialEntries: ['/admin/benutzer'] });
    const sidebar = screen.getByTestId('admin-sub-sidebar');
    const active = sidebar.querySelectorAll('a[aria-current="page"]');
    expect(active.length).toBe(1);
    expect(active[0]?.getAttribute('href')).toBe('/admin/benutzer');
  });

  it('rendert den Outlet-Content der Sub-Page', () => {
    renderWithRouter(harness(), { initialEntries: ['/admin/messstellen'] });
    expect(screen.getByTestId('stub-messstellen')).toBeInTheDocument();
  });
});
