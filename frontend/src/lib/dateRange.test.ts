import { describe, expect, it } from 'vitest';

import { currentYearRange, formatRangeDe, formatRangeShort, shiftRangeByYears } from './dateRange';

describe('dateRange helpers', () => {
  it('currentYearRange liefert 1.1.–31.12. des gegebenen Jahres', () => {
    expect(currentYearRange(new Date(2026, 5, 4))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('shiftRangeByYears verschiebt beide Endpunkte um ganze Jahre', () => {
    expect(shiftRangeByYears({ from: '2026-01-01', to: '2026-12-31' }, -1)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(shiftRangeByYears({ from: '2026-03-15', to: '2026-08-20' }, 2)).toEqual({
      from: '2028-03-15',
      to: '2028-08-20',
    });
  });

  it('clamped den 29. Februar auf den 28., wenn das Zieljahr kein Schaltjahr ist', () => {
    expect(shiftRangeByYears({ from: '2024-02-29', to: '2024-02-29' }, -1)).toEqual({
      from: '2023-02-28',
      to: '2023-02-28',
    });
    // 2024 -> 2028 ist wieder Schaltjahr -> bleibt 29.
    expect(shiftRangeByYears({ from: '2024-02-29', to: '2024-02-29' }, 4)).toEqual({
      from: '2028-02-29',
      to: '2028-02-29',
    });
  });

  it('reicht leere Endpunkte unverändert durch', () => {
    expect(shiftRangeByYears({ from: '', to: '' }, -1)).toEqual({ from: '', to: '' });
  });

  it('formatRangeDe formatiert deutsch mit Gedankenstrich', () => {
    expect(formatRangeDe({ from: '2026-01-01', to: '2026-12-31' })).toBe('01.01.2026 – 31.12.2026');
  });

  describe('formatRangeShort', () => {
    it('gleiches Jahr → Start ohne Jahr, Ende als YY (immer beide Daten)', () => {
      expect(formatRangeShort({ from: '2026-01-01', to: '2026-12-31' })).toBe('01.01.–31.12.26');
      expect(formatRangeShort({ from: '2026-03-01', to: '2026-12-31' })).toBe('01.03.–31.12.26');
    });
    it('jahresübergreifend → beide Jahre als YY', () => {
      expect(formatRangeShort({ from: '2025-03-15', to: '2027-08-20' })).toBe('15.03.25–20.08.27');
    });
    it('offener Endpunkt → Fallback auf das volle Format', () => {
      const r = { from: '', to: '2026-12-31' };
      expect(formatRangeShort(r)).toBe(formatRangeDe(r));
    });
  });
});
