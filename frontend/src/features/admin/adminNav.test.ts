/**
 * Sichtbarkeit der Admin-Bereiche: Admins sehen alles, Benutzer mit dem Merkmal „darf abrechnen"
 * nur die Abrechnung, alle anderen nichts.
 */
import { describe, expect, it } from 'vitest';

import { ADMIN_SECTIONS, sectionsFor } from './adminNav';

describe('sectionsFor', () => {
  it('zeigt Admins alle Bereiche', () => {
    expect(sectionsFor({ role: 'admin', can_billing: false })).toHaveLength(ADMIN_SECTIONS.length);
  });

  it('zeigt Benutzern mit Abrechnungsrecht nur die Abrechnung', () => {
    const sichtbar = sectionsFor({ role: 'recorder', can_billing: true });
    expect(sichtbar.map((s) => s.to)).toEqual(['/admin/abrechnungskreise']);
  });

  it('zeigt Erfassern ohne Merkmal nichts', () => {
    expect(sectionsFor({ role: 'recorder', can_billing: false })).toEqual([]);
    expect(sectionsFor(null)).toEqual([]);
  });
});
