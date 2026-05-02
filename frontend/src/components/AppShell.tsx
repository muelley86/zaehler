/**
 * Haupt-Layout der App.
 *
 * Mobile (<= md): kompakter Header oben und Bottom-Tab-Bar unten.
 * Desktop (>= md): Sidebar links mit allen Routen, kein Tab-Bar.
 * Admin-Routen sind nur sichtbar, wenn der angemeldete User Admin-Rechte hat.
 */

import type { ReactNode } from 'react';
import {
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPin,
  MoreHorizontal,
  PencilLine,
  ScrollText,
  Users,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';
import { cx } from './ui/cx';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  adminOnly?: boolean;
  mobileTabBar?: boolean;
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: <LayoutDashboard size={22} />,
    end: true,
    mobileTabBar: true,
  },
  { to: '/erfassen', label: 'Erfassen', icon: <PencilLine size={22} />, mobileTabBar: true },
  {
    to: '/erfassungen',
    label: 'Erfassungen',
    icon: <ClipboardList size={22} />,
    mobileTabBar: true,
  },
  { to: '/messstellen', label: 'Messstellen', icon: <Gauge size={22} />, adminOnly: true },
  { to: '/standorte', label: 'Standorte', icon: <MapPin size={22} />, adminOnly: true },
  { to: '/benutzer', label: 'Benutzer', icon: <Users size={22} />, adminOnly: true },
  { to: '/audit', label: 'Audit', icon: <ScrollText size={22} />, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = me?.role === 'admin';

  const visible = NAV.filter((n) => !n.adminOnly || isAdmin);
  const tabBar = NAV.filter((n) => n.mobileTabBar);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-ios-separator md:bg-ios-surface md:pt-safe-top">
        <div className="px-5 pb-2 pt-5">
          <div className="font-rounded text-ios-title2">Zählerstand</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {visible.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end ?? false}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-ios px-3 py-2 text-ios-body',
                  isActive ? 'bg-ios-blue text-white' : 'text-ios-label hover:bg-ios-elevated/50',
                )
              }
            >
              <span className="opacity-80">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ios-separator p-3">
          <div className="px-2 pb-2 text-ios-footnote text-ios-tertiary">
            {me?.username} · {me?.role}
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-ios px-3 py-2 text-ios-body text-ios-red hover:bg-ios-red/10"
          >
            <LogOut size={20} />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Mobile header (sticky, shows app name as compact title) */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-ios-separator/60 bg-ios-bg/85 px-4 pb-2 pt-safe-top backdrop-blur md:hidden">
          <div className="pt-3 text-ios-headline">Zählerstand</div>
          <div className="pt-3 text-ios-footnote text-ios-tertiary">{me?.username}</div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-8">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-4 border-t border-ios-separator/60 bg-ios-surface/90 pb-safe-bottom backdrop-blur md:hidden">
          {tabBar.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end ?? false}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 px-1 pb-1 pt-2 text-ios-caption',
                  isActive ? 'text-ios-blue' : 'text-ios-tertiary',
                )
              }
            >
              {n.icon}
              <span>{n.label}</span>
            </NavLink>
          ))}
          <NavLink
            to="/mehr"
            className={({ isActive }) =>
              cx(
                'flex flex-col items-center gap-0.5 px-1 pb-1 pt-2 text-ios-caption',
                isActive ? 'text-ios-blue' : 'text-ios-tertiary',
              )
            }
          >
            <MoreHorizontal size={22} />
            <span>Mehr</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
