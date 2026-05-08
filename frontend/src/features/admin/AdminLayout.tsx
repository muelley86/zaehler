/**
 * Layout-Wrapper fuer alle Routen unter ``/admin/*``.
 *
 * Eingebunden in {@link App} als Outlet-Parent; rendert links eine
 * Sub-Sidebar (Desktop, ~ 13rem) bzw. oben einen sticky horizontalen
 * Tab-Strip (Mobile/Tablet < md) und reicht den Page-Content via
 * ``<Outlet />`` durch. Der frueher pro Page wiederholte ``PageContainer``-
 * Helper (``relative min-h-full overflow-hidden bg-bg`` + {@link PageGlows} +
 * ``space-y-5 p-4 pb-12 md:p-7``) ist hierhin gewandert. Sub-Pages rendern
 * nur noch ihren Inhalt als Fragment.
 */

import { LayoutGrid } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { PageGlows } from '@/components/PageGlows';
import { cx } from '@/components/ui/cx';
import { ADMIN_SECTIONS } from './adminNav';

const subNavLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'relative flex items-center gap-2.5 rounded-pill px-2.5 py-2 text-body-sm tracking-tight transition-colors',
    isActive
      ? 'bg-fill font-semibold text-label'
      : 'font-medium text-secondary hover:bg-fill/60 hover:text-label',
  );

const chipLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'shrink-0 rounded-pill px-3 py-1.5 text-caption font-semibold tracking-tight transition-colors',
    isActive
      ? 'bg-surface-solid text-label shadow-glass'
      : 'text-tertiary hover:text-secondary',
  );

export function AdminLayout() {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 flex flex-col md:flex-row">
        {/* Desktop: Sub-Sidebar links */}
        <aside
          data-testid="admin-sub-sidebar"
          className="hidden md:block md:w-52 md:shrink-0 md:border-r-hairline md:border-border md:p-4"
        >
          <div className="px-2 pb-2 text-caption-bold uppercase text-tertiary">Verwaltung</div>
          <nav className="flex flex-col gap-0.5">
            <NavLink to="/admin" end className={subNavLink}>
              <LayoutGrid size={18} className="shrink-0 opacity-70" />
              Übersicht
            </NavLink>
            {ADMIN_SECTIONS.map((s) => (
              <NavLink key={s.to} to={s.to} className={subNavLink}>
                <span className="shrink-0 opacity-70">{s.icon}</span>
                {s.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile/schmal: horizontaler Tab-Strip oben (sticky, scrollbar) */}
        <div
          data-testid="admin-tab-strip"
          className="sticky top-0 z-10 mb-1 overflow-x-auto border-b-hairline border-border bg-surface/80 backdrop-blur md:hidden"
        >
          <nav className="flex gap-1 px-4 py-2">
            <NavLink to="/admin" end className={chipLink}>
              Übersicht
            </NavLink>
            {ADMIN_SECTIONS.map((s) => (
              <NavLink key={s.to} to={s.to} className={chipLink}>
                {s.short ?? s.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Outlet (Page-Content) */}
        <div className="min-w-0 flex-1 space-y-5 p-4 pb-12 md:p-7 md:pb-12">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
