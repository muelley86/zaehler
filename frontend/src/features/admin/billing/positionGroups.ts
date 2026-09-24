/**
 * Positionen eines Abrechnungskreises nach Empfänger gruppiert — so, wie der Abrechnungslauf
 * sie ordnet: Gruppen nach ihrer ersten Position, interne Umlage immer zuletzt. Die Reihenfolge
 * wird nur noch verschoben (Drag & Drop); die Nummern vergibt der Server (10, 20, 30, …).
 */
import { arrayMove } from '@dnd-kit/sortable';

import type { BillingPositionRead } from '@/lib/types';

export interface PositionGroup {
  /**
   * Stabiler Schlüssel für Drag & Drop (interne Umlage + Art + Empfängername, leer = ohne
   * Empfänger).
   */
  key: string;
  recipient: string | null;
  internal: boolean;
  /** Empfänger ist ein Mieter („Abrechnen an Mieter“). */
  mieter: boolean;
  positions: BillingPositionRead[];
}

export function groupKey(p: BillingPositionRead): string {
  const art = p.recipient_internal ? 'intern' : 'extern';
  return `${art}:${p.recipient_kind ?? ''}:${p.recipient_name ?? ''}`;
}

/** Gruppiert die Positionen nach heutigem Empfänger (Reihenfolge = `sort_order`). */
export function groupPositions(positions: BillingPositionRead[]): PositionGroup[] {
  const sorted = [...positions].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'de'),
  );
  const groups = new Map<string, PositionGroup>();
  for (const p of sorted) {
    const key = groupKey(p);
    const group = groups.get(key);
    if (group) group.positions.push(p);
    else
      groups.set(key, {
        key,
        recipient: p.recipient_name,
        internal: p.recipient_internal,
        mieter: p.recipient_kind === 'mieter',
        positions: [p],
      });
  }
  const all = [...groups.values()];
  return [...all.filter((g) => !g.internal), ...all.filter((g) => g.internal)];
}

/** Reihenfolge aller Positionen (IDs) wie angezeigt — Nutzlast für `PUT …/positions/order`. */
export function flattenGroups(groups: PositionGroup[]): number[] {
  return groups.flatMap((g) => g.positions.map((p) => p.id));
}

/**
 * Verschiebt eine Gruppe an die Stelle einer anderen. Interne Umlage und übrige Empfänger
 * bleiben getrennt (die interne Umlage wird immer zuletzt abgerechnet) — sonst `null`.
 */
export function moveGroup(
  groups: PositionGroup[],
  activeKey: string,
  overKey: string,
): PositionGroup[] | null {
  const from = groups.findIndex((g) => g.key === activeKey);
  const to = groups.findIndex((g) => g.key === overKey);
  if (from < 0 || to < 0 || from === to) return null;
  if (groups[from]?.internal !== groups[to]?.internal) return null;
  return arrayMove(groups, from, to);
}

/** Verschiebt eine Position innerhalb ihrer Gruppe; über Gruppengrenzen hinweg `null`. */
export function movePosition(
  groups: PositionGroup[],
  activeId: number,
  overId: number,
): PositionGroup[] | null {
  const index = groups.findIndex((g) => g.positions.some((p) => p.id === activeId));
  const group = groups[index];
  if (!group) return null;
  const from = group.positions.findIndex((p) => p.id === activeId);
  const to = group.positions.findIndex((p) => p.id === overId);
  if (to < 0 || from === to) return null;
  const next = [...groups];
  next[index] = { ...group, positions: arrayMove(group.positions, from, to) };
  return next;
}
