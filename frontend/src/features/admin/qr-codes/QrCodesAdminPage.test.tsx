/**
 * Tests fuer die localStorage-Migration alter Layout-IDs.
 *
 * Hintergrund: ``avery-l4731rev`` und ``avery-3320`` wurden durch die
 * einzige neue Vorlage ``avery-l6008`` ersetzt. ``migrateLayoutId``
 * mappt die alten Werte beim Load der Druck-Praeferenzen um, damit
 * User mit gespeicherter Auswahl nach dem Update nicht auf
 * ``cut-2x4`` zurueckgeworfen werden.
 */

import { describe, expect, it } from 'vitest';

import { migrateLayoutId } from './QrCodesAdminPage';

describe('migrateLayoutId', () => {
  it('laesst aktuelle IDs unveraendert', () => {
    expect(migrateLayoutId('cut-2x4')).toBe('cut-2x4');
    expect(migrateLayoutId('avery-l6008')).toBe('avery-l6008');
  });

  it('mappt avery-l4731rev auf avery-l6008 (identische Geometrie)', () => {
    expect(migrateLayoutId('avery-l4731rev')).toBe('avery-l6008');
  });

  it('verwirft avery-3320 (kein Geometrie-Pendant)', () => {
    // Caller faellt auf den Default zurueck (`cut-2x4`), wenn null kommt.
    expect(migrateLayoutId('avery-3320')).toBeNull();
  });

  it('liefert null fuer unbekannte oder falsch typisierte Werte', () => {
    expect(migrateLayoutId('unknown')).toBeNull();
    expect(migrateLayoutId(42)).toBeNull();
    expect(migrateLayoutId(undefined)).toBeNull();
  });
});
