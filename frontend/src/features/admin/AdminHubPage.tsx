/**
 * Hub-Seite unter ``/admin``.
 *
 * Card-Grid mit allen Sektionen aus {@link ADMIN_SECTIONS}. Pro Card eine
 * farbige Icon-Box, Titel, Kurzbeschreibung und — wo sinnvoll — ein
 * Counter (Anzahl Datensaetze). Counter werden parallel ueber
 * ``Promise.allSettled`` geladen; faellt ein einzelner Endpoint aus,
 * blendet die jeweilige Card den Counter einfach aus, der Rest
 * funktioniert weiter.
 *
 * Audit / System / Sessions zeigen keinen Counter:
 * Audit waere uninformativ ("200 Eintraege"), die anderen beiden sind in
 * PR 4 noch Skelette.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { LargeTitle } from '@/components/ui';
import { api } from '@/lib/api';
import type {
  LocationRead,
  MainLocationRead,
  MeasuringPointRead,
  OwnerRead,
  QrTokenRead,
  SupplierRead,
  UserRead,
} from '@/lib/types';
import { cx } from '@/components/ui/cx';

import { ADMIN_SECTIONS, type AdminNavItem, type AdminSectionColor } from './adminNav';

interface Counts {
  '/admin/messstellen'?: number;
  '/admin/standorte'?: number;
  '/admin/hauptstandorte'?: number;
  '/admin/eigentuemer'?: number;
  '/admin/lieferanten'?: number;
  '/admin/benutzer'?: number;
  '/admin/qr-codes'?: number;
}

const COLOR_BG: Record<AdminSectionColor, string> = {
  primary: 'bg-primary-soft text-primary-deep',
  electricity: 'bg-electricity/15 text-electricity',
  water: 'bg-water/15 text-water',
  heating: 'bg-oil/15 text-oil',
};

export function AdminHubPage() {
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      api.get<UserRead[]>('/users'),
      api.get<MeasuringPointRead[]>('/measuring-points'),
      api.get<LocationRead[]>('/locations'),
      api.get<MainLocationRead[]>('/main-locations'),
      api.get<OwnerRead[]>('/owners'),
      api.get<SupplierRead[]>('/suppliers'),
      api.get<QrTokenRead[]>('/qr-tokens'),
    ]).then(([users, mps, locs, mains, owners, suppliers, tokens]) => {
      if (cancelled) return;
      const next: Counts = {};
      if (users.status === 'fulfilled') next['/admin/benutzer'] = users.value.length;
      if (mps.status === 'fulfilled') next['/admin/messstellen'] = mps.value.length;
      if (locs.status === 'fulfilled') next['/admin/standorte'] = locs.value.length;
      if (mains.status === 'fulfilled') next['/admin/hauptstandorte'] = mains.value.length;
      if (owners.status === 'fulfilled') next['/admin/eigentuemer'] = owners.value.length;
      if (suppliers.status === 'fulfilled') next['/admin/lieferanten'] = suppliers.value.length;
      if (tokens.status === 'fulfilled') next['/admin/qr-codes'] = tokens.value.length;
      setCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <LargeTitle title="Verwaltung" subtitle="Konten, Daten, System" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="admin-hub-grid">
        {ADMIN_SECTIONS.map((s) => (
          <HubCard key={s.to} section={s} counter={counts[s.to as keyof Counts]} />
        ))}
      </div>
    </>
  );
}

function HubCard({ section, counter }: { section: AdminNavItem; counter: number | undefined }) {
  return (
    <Link
      to={section.to}
      data-testid={`admin-hub-card-${section.to}`}
      className="hover:shadow-glow-primary group rounded-card border-hairline border-border bg-surface p-5 transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div
          className={cx(
            'flex h-10 w-10 items-center justify-center rounded-[10px]',
            COLOR_BG[section.color],
          )}
        >
          {section.icon}
        </div>
        {counter !== undefined ? (
          <span className="num text-caption-bold text-tertiary">{counter}</span>
        ) : null}
      </div>
      <div className="mt-3 text-headline tracking-tight text-label">{section.label}</div>
      <div className="text-caption text-tertiary">{section.description}</div>
    </Link>
  );
}
