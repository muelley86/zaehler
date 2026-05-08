/**
 * Haupt-Layout der App im Liquid-Glass-Stil.
 *
 * Mobile (<= md): kompakter Header oben mit Logo-Lockup + Bottom-Tab-Bar
 * unten (Glasflächen, 4 Tabs: Dashboard / Erfassen-CTA / Erfassungen / Mehr).
 * Desktop (>= md): 240-px-Sidebar links mit Logo, primären Routen,
 * Admin-Sektion und Profil-Footer.
 *
 * Die Admin-Sektion enthält nur einen Eintrag "Verwaltung" auf den Hub
 * (/admin); die acht Sub-Bereiche werden im AdminLayout selber per
 * Sub-Sidebar bzw. Tab-Strip angezeigt.
 */

import type { ReactNode } from 'react';
import {
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PencilLine,
  Plus,
  Settings,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/auth-context';
import { cx } from './ui/cx';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  adminOnly?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/erfassen', label: 'Erfassen', icon: <PencilLine size={18} /> },
  { to: '/erfassungen', label: 'Erfassungen', icon: <ClipboardList size={18} /> },
];

// Sekundäre Navigation: enthält /mehr (Profil, 2FA, Theme, Logout). Auf
// Mobile in der Tab-Bar als "Mehr"-Tab; auf Desktop separat unten in der
// Sidebar gerendert (klar von Hauptnav abgesetzt).
const SECONDARY_NAV: NavItem[] = [
  { to: '/mehr', label: 'Einstellungen', icon: <Settings size={18} /> },
];

// Top-Level-Admin-Eintrag: nur ein Link auf den Hub. Die acht Sub-Bereiche
// (Messstellen, Standorte, Benutzer, QR-Codes, Audit, System, Statistiken,
// Sessions) leben im AdminLayout selbst — Sub-Sidebar (Desktop) bzw.
// horizontaler Tab-Strip (Mobile).
const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Verwaltung', icon: <Settings size={18} /> },
];

function LogoLockup({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const square = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <div className="flex items-center gap-2.5" data-testid="logo-lockup">
      <div
        className={cx(
          'bg-gradient-primary shadow-glow-primary flex items-center justify-center rounded-[9px] text-white',
          square,
        )}
      >
        <Gauge size={size === 'sm' ? 16 : 18} strokeWidth={2.5} />
      </div>
      <div className="text-headline tracking-tight text-label">Zählerstand</div>
    </div>
  );
}

function Avatar({ name, role }: { name: string; role: string }) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="bg-gradient-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-body-sm font-bold text-white">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-semibold text-label">{name}</div>
        <div className="truncate text-caption text-tertiary">{role}</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = me?.role === 'admin';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const sidebarLink = ({ isActive }: { isActive: boolean }) =>
    cx(
      'relative flex items-center gap-2.5 rounded-pill px-2.5 py-2 text-body-sm tracking-tight transition-colors',
      isActive
        ? 'bg-fill font-semibold text-label'
        : 'font-medium text-secondary hover:bg-fill/60 hover:text-label',
    );

  const renderActiveRail = ({ isActive }: { isActive: boolean }) =>
    isActive ? (
      <span
        aria-hidden
        className="absolute -left-1.5 bottom-2 top-2 w-[3px] rounded-full bg-primary"
      />
    ) : null;

  const tabBarLink = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[10px] font-medium tracking-tight transition-colors',
      isActive ? 'text-primary' : 'text-tertiary',
    );

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col md:flex-row">
      {/* ============ Sidebar (Desktop) ============ */}
      <aside
        data-testid="app-sidebar"
        className={cx(
          'hidden md:flex md:w-60 md:shrink-0 md:flex-col',
          'md:glass md:border-r-hairline md:border-border md:bg-surface',
          'md:px-3 md:pb-3 md:pt-5 md:pt-safe-top',
        )}
      >
        <div className="px-2 pb-4">
          <LogoLockup />
        </div>

        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end ?? false} className={sidebarLink}>
              {(state) => (
                <>
                  {renderActiveRail(state)}
                  <span className={cx('shrink-0', state.isActive ? 'opacity-100' : 'opacity-70')}>
                    {n.icon}
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="px-2.5 pb-1.5 pt-4 text-caption-bold uppercase text-tertiary">
                Administration
              </div>
              {ADMIN_NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={sidebarLink}>
                  {(state) => (
                    <>
                      {renderActiveRail(state)}
                      <span
                        className={cx('shrink-0', state.isActive ? 'opacity-100' : 'opacity-70')}
                      >
                        {n.icon}
                      </span>
                      {n.label}
                    </>
                  )}
                </NavLink>
              ))}
            </>
          )}

          <div className="px-2.5 pb-1.5 pt-4 text-caption-bold uppercase text-tertiary">Profil</div>
          {SECONDARY_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={sidebarLink}>
              {(state) => (
                <>
                  {renderActiveRail(state)}
                  <span className={cx('shrink-0', state.isActive ? 'opacity-100' : 'opacity-70')}>
                    {n.icon}
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t-hairline border-separator px-1 pt-3">
          <div className="flex items-center gap-2 px-1">
            <NavLink
              to="/mehr"
              aria-label="Profil & Einstellungen"
              data-testid="sidebar-profile"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-pill px-1 py-1 transition-colors hover:bg-fill"
            >
              <Avatar name={me?.username ?? '–'} role={me?.role ?? ''} />
            </NavLink>
            <button
              type="button"
              onClick={() => void handleLogout()}
              aria-label="Abmelden"
              data-testid="sidebar-logout"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-fill hover:text-danger"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ============ Main + Mobile-Chrome ============ */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Mobile-Header */}
        <header
          data-testid="app-mobile-header"
          className="glass sticky top-0 z-20 flex items-center justify-between gap-2 border-b-hairline border-border bg-surface px-4 pb-2.5 pt-safe-top md:hidden"
        >
          <div className="pt-3">
            <LogoLockup size="sm" />
          </div>
          <div className="pt-3 text-caption text-tertiary">{me?.username}</div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile-Bottom-Tab-Bar */}
        <nav
          data-testid="app-tabbar"
          className={cx(
            'fixed bottom-0 left-0 right-0 z-20 grid grid-cols-4',
            'glass border-t-hairline border-border bg-surface-high',
            'pb-safe-bottom md:hidden',
          )}
        >
          <NavLink to="/" end className={tabBarLink}>
            <LayoutDashboard size={22} strokeWidth={2} />
            <span>Dashboard</span>
          </NavLink>

          {/* Erfassen-CTA — prominenter Plus-Button im Primary-Gradient */}
          <NavLink
            to="/erfassen"
            aria-label="Neue Erfassung"
            className="flex flex-col items-center gap-1 pb-1.5 pt-1.5"
          >
            {({ isActive }) => (
              <>
                <span
                  className={cx(
                    'flex h-9 w-9 items-center justify-center rounded-[12px]',
                    'bg-gradient-primary shadow-glow-primary text-white',
                    isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-high',
                  )}
                >
                  <Plus size={20} strokeWidth={2.5} aria-hidden />
                </span>
                <span
                  className={cx(
                    'text-[10px] font-medium tracking-tight',
                    isActive ? 'text-primary' : 'text-tertiary',
                  )}
                >
                  Erfassen
                </span>
              </>
            )}
          </NavLink>

          <NavLink to="/erfassungen" className={tabBarLink}>
            <ClipboardList size={22} strokeWidth={2} />
            <span>Erfassungen</span>
          </NavLink>
          <NavLink to="/mehr" className={tabBarLink}>
            <MoreHorizontal size={22} strokeWidth={2} />
            <span>Mehr</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
