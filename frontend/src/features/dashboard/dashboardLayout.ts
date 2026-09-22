/**
 * Reine Funktionen für das Kachel-Layout des Dashboards (Reihenfolge und
 * eingeklappte Kacheln). `normalizeLayout` spiegelt die Lese-Regel des Backends
 * (`schemas/dashboard_layout.py::normalize_layout`): unbekannte IDs fallen raus,
 * fehlende werden hinten angehängt.
 */

import { arrayMove } from '@dnd-kit/sortable';

import type { DashboardLayout, DashboardTileId } from '@/lib/types';

export const TILE_IDS: readonly DashboardTileId[] = ['kpi', 'due', 'insights', 'top'];

export const DEFAULT_LAYOUT: DashboardLayout = { order: [...TILE_IDS], collapsed: [] };

export function isTileId(x: unknown): x is DashboardTileId {
  return typeof x === 'string' && (TILE_IDS as readonly string[]).includes(x);
}

function knownUnique(raw: unknown): DashboardTileId[] {
  if (!Array.isArray(raw)) return [];
  const result: DashboardTileId[] = [];
  for (const item of raw) {
    if (isTileId(item) && !result.includes(item)) result.push(item);
  }
  return result;
}

export function normalizeLayout(raw: unknown): DashboardLayout {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const order = knownUnique(data.order);
  return {
    order: [...order, ...TILE_IDS.filter((id) => !order.includes(id))],
    collapsed: knownUnique(data.collapsed),
  };
}

/** Verschiebt eine Kachel um `delta` Plätze; am Rand bleibt das Layout unverändert. */
export function moveTile(
  layout: DashboardLayout,
  id: DashboardTileId,
  delta: number,
): DashboardLayout {
  const from = layout.order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layout.order.length) return layout;
  return { ...layout, order: arrayMove(layout.order, from, to) };
}

/** Drag & Drop: `activeId` an die Position von `overId`. */
export function reorderTiles(
  layout: DashboardLayout,
  activeId: DashboardTileId,
  overId: DashboardTileId,
): DashboardLayout {
  const from = layout.order.indexOf(activeId);
  const to = layout.order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return layout;
  return { ...layout, order: arrayMove(layout.order, from, to) };
}

export function toggleCollapsed(layout: DashboardLayout, id: DashboardTileId): DashboardLayout {
  const collapsed = layout.collapsed.includes(id)
    ? layout.collapsed.filter((c) => c !== id)
    : [...layout.collapsed, id];
  return { ...layout, collapsed };
}
