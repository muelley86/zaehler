/**
 * Gruppierung der Positionen nach Empfänger und Verschieben (Drag & Drop) als reine Logik.
 */
import { describe, expect, it } from 'vitest';

import type { BillTo, BillingPositionRead } from '@/lib/types';

import { flattenGroups, groupPositions, moveGroup, movePosition } from './positionGroups';

function pos(
  id: number,
  sort_order: number,
  recipient_name: string | null,
  recipient_internal = false,
  recipient_kind: BillTo | null = recipient_name === null ? null : 'owner',
): BillingPositionRead {
  return {
    id,
    circle_id: 1,
    sort_order,
    label: `P${id}`,
    kind: 'meter',
    measuring_point_id: id,
    measuring_point_name: `MP ${id}`,
    parent_position_id: null,
    owner_id: null,
    owner_name: null,
    recipient_name,
    recipient_kind,
    recipient_internal,
    kostenstelle: null,
    invoice_line: null,
    note: null,
    valid_from: '2026-08-01',
    valid_to: null,
  };
}

// Reihenfolge laut Server: A, Intern, B, A, ohne Empfänger, B
const POSITIONS = [
  pos(6, 60, 'B KG'),
  pos(1, 10, 'A KG'),
  pos(2, 20, 'Service GmbH', true),
  pos(3, 30, 'B KG'),
  pos(4, 40, 'A KG'),
  pos(5, 50, null),
];

describe('groupPositions', () => {
  it('gruppiert nach erster Position, interne Umlage zuletzt', () => {
    const groups = groupPositions(POSITIONS);
    expect(groups.map((g) => [g.recipient, g.positions.map((p) => p.id)])).toEqual([
      ['A KG', [1, 4]],
      ['B KG', [3, 6]],
      [null, [5]],
      ['Service GmbH', [2]],
    ]);
    expect(flattenGroups(groups)).toEqual([1, 4, 3, 6, 5, 2]);
  });
});

describe('groupPositions mit Mieter-Empfaengern', () => {
  it('trennt gleichnamige Eigentuemer und Mieter und markiert die Mieter-Gruppe', () => {
    const groups = groupPositions([
      pos(1, 10, 'Muster', false, 'owner'),
      pos(2, 20, 'Muster', false, 'mieter'),
    ]);
    expect(groups.map((g) => [g.recipient, g.mieter, g.positions.map((p) => p.id)])).toEqual([
      ['Muster', false, [1]],
      ['Muster', true, [2]],
    ]);
  });
});

describe('moveGroup', () => {
  it('verschiebt eine Gruppe samt Positionen', () => {
    const groups = groupPositions(POSITIONS);
    const next = moveGroup(groups, 'extern:owner:B KG', 'extern:owner:A KG');
    expect(next && flattenGroups(next)).toEqual([3, 6, 1, 4, 5, 2]);
  });

  it('hält die interne Umlage am Ende', () => {
    const groups = groupPositions(POSITIONS);
    expect(moveGroup(groups, 'intern:owner:Service GmbH', 'extern:owner:A KG')).toBeNull();
    expect(moveGroup(groups, 'extern:owner:A KG', 'intern:owner:Service GmbH')).toBeNull();
  });

  it('ignoriert Ablegen an derselben Stelle', () => {
    expect(
      moveGroup(groupPositions(POSITIONS), 'extern:owner:A KG', 'extern:owner:A KG'),
    ).toBeNull();
  });
});

describe('movePosition', () => {
  it('verschiebt innerhalb der Gruppe', () => {
    const next = movePosition(groupPositions(POSITIONS), 4, 1);
    expect(next && flattenGroups(next)).toEqual([4, 1, 3, 6, 5, 2]);
  });

  it('verschiebt nicht in eine andere Gruppe', () => {
    expect(movePosition(groupPositions(POSITIONS), 1, 3)).toBeNull();
  });
});
