/**
 * Kachel-Layout des Dashboards je Benutzer (`/auth/me/dashboard-layout`).
 *
 * Laden: einmal beim Mount; scheitert der Request (offline, Server-Fehler),
 * gilt das Standard-Layout — das Dashboard bleibt benutzbar.
 * Speichern: optimistisch im State, der PUT läuft entprellt mit dem jeweils
 * letzten Stand (Drag & Drop bzw. mehrere ▲/▼-Klicks = ein Request). Beim
 * Unmount wird ein ausstehender PUT sofort abgeschickt. Ein fehlgeschlagener
 * PUT bleibt still: das lokale Layout steht, beim nächsten Laden gilt wieder
 * der Serverstand.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import type { DashboardLayout, DashboardTileId } from '@/lib/types';
import {
  DEFAULT_LAYOUT,
  moveTile,
  normalizeLayout,
  reorderTiles,
  toggleCollapsed,
} from './dashboardLayout';

export const LAYOUT_PATH = '/auth/me/dashboard-layout';
const SAVE_DELAY_MS = 400;

export interface DashboardLayoutState {
  layout: DashboardLayout;
  /** true, sobald der Serverstand geladen (oder der Request gescheitert) ist. */
  ready: boolean;
  move: (id: DashboardTileId, delta: number) => void;
  reorder: (activeId: DashboardTileId, overId: DashboardTileId) => void;
  toggle: (id: DashboardTileId) => void;
}

function save(layout: DashboardLayout): void {
  api.put<DashboardLayout>(LAYOUT_PATH, layout).catch(() => {
    /* still: siehe Datei-Kommentar */
  });
}

export function useDashboardLayout(): DashboardLayoutState {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [ready, setReady] = useState(false);
  // Aktueller Stand für `update` — Nebenwirkungen (Timer) gehören nicht in einen
  // State-Updater, der unter StrictMode doppelt laufen kann.
  const layoutRef = useRef<DashboardLayout>(DEFAULT_LAYOUT);
  const pending = useRef<DashboardLayout | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hat der User schon umsortiert, bevor der GET zurückkam, gewinnt seine Änderung.
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<unknown>(LAYOUT_PATH)
      .then((raw) => {
        if (cancelled || touched.current) return;
        const loaded = normalizeLayout(raw);
        layoutRef.current = loaded;
        setLayout(loaded);
      })
      .catch(() => {
        /* Standard-Layout bleibt */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (pending.current !== null) save(pending.current);
    },
    [],
  );

  const update = useCallback((fn: (prev: DashboardLayout) => DashboardLayout) => {
    const prev = layoutRef.current;
    const next = fn(prev);
    if (next === prev) return;
    layoutRef.current = next;
    touched.current = true;
    pending.current = next;
    setLayout(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pending.current !== null) save(pending.current);
      pending.current = null;
    }, SAVE_DELAY_MS);
  }, []);

  const move = useCallback(
    (id: DashboardTileId, delta: number) => update((prev) => moveTile(prev, id, delta)),
    [update],
  );
  const reorder = useCallback(
    (activeId: DashboardTileId, overId: DashboardTileId) =>
      update((prev) => reorderTiles(prev, activeId, overId)),
    [update],
  );
  const toggle = useCallback(
    (id: DashboardTileId) => update((prev) => toggleCollapsed(prev, id)),
    [update],
  );

  return { layout, ready, move, reorder, toggle };
}
