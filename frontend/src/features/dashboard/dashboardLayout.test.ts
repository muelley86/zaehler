import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAYOUT,
  moveTile,
  normalizeLayout,
  reorderTiles,
  toggleCollapsed,
} from './dashboardLayout';

describe('normalizeLayout', () => {
  it('liefert bei Unsinn das Standard-Layout', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout('x')).toEqual(DEFAULT_LAYOUT);
  });

  it('verwirft unbekannte/doppelte IDs und hängt fehlende an', () => {
    expect(normalizeLayout({ order: ['top', 'chart', 'top'], collapsed: ['due', 'nope'] })).toEqual(
      { order: ['top', 'kpi', 'due', 'insights'], collapsed: ['due'] },
    );
  });
});

describe('moveTile', () => {
  it('verschiebt um einen Platz', () => {
    expect(moveTile(DEFAULT_LAYOUT, 'due', -1).order).toEqual(['due', 'kpi', 'insights', 'top']);
    expect(moveTile(DEFAULT_LAYOUT, 'due', 1).order).toEqual(['kpi', 'insights', 'due', 'top']);
  });

  it('bleibt am Rand unverändert', () => {
    expect(moveTile(DEFAULT_LAYOUT, 'kpi', -1)).toBe(DEFAULT_LAYOUT);
    expect(moveTile(DEFAULT_LAYOUT, 'top', 1)).toBe(DEFAULT_LAYOUT);
  });
});

describe('reorderTiles', () => {
  it('setzt die gezogene Kachel an die Zielposition', () => {
    expect(reorderTiles(DEFAULT_LAYOUT, 'top', 'kpi').order).toEqual([
      'top',
      'kpi',
      'due',
      'insights',
    ]);
  });
});

describe('toggleCollapsed', () => {
  it('klappt ein und wieder aus', () => {
    const zu = toggleCollapsed(DEFAULT_LAYOUT, 'top');
    expect(zu.collapsed).toEqual(['top']);
    expect(toggleCollapsed(zu, 'top').collapsed).toEqual([]);
  });
});
