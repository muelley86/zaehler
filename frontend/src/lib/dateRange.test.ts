import { describe, expect, it } from 'vitest';

import {
  currentAndLastMonthRange,
  formatRangeDe,
  formatRangeShort,
  shiftRangeByMonths,
} from './dateRange';

describe('dateRange helpers', () => {
  it('currentAndLastMonthRange liefert Vormonatsanfang bis Ende des laufenden Monats', () => {
    expect(currentAndLastMonthRange(new Date(2026, 5, 4))).toEqual({
      from: '2026-05-01',
      to: '2026-06-30',
    });
  });

  it('currentAndLastMonthRange im Januar reicht in den Dezember des Vorjahres', () => {
    expect(currentAndLastMonthRange(new Date(2026, 0, 15))).toEqual({
      from: '2025-12-01',
      to: '2026-01-31',
    });
  });

  it('currentAndLastMonthRange im Februar endet am Schalttag, wenn Schaltjahr', () => {
    expect(currentAndLastMonthRange(new Date(2028, 1, 10))).toEqual({
      from: '2028-01-01',
      to: '2028-02-29',
    });
    expect(currentAndLastMonthRange(new Date(2026, 1, 10))).toEqual({
      from: '2026-01-01',
      to: '2026-02-28',
    });
  });

  it('shiftRangeByMonths verschiebt beide Endpunkte um ganze Monate', () => {
    expect(shiftRangeByMonths({ from: '2026-03-15', to: '2026-08-20' }, 2)).toEqual({
      from: '2026-05-15',
      to: '2026-10-20',
    });
  });

  it('shiftRangeByMonths über die Jahresgrenze hinweg', () => {
    expect(shiftRangeByMonths({ from: '2026-01-05', to: '2026-02-10' }, -2)).toEqual({
      from: '2025-11-05',
      to: '2025-12-10',
    });
    expect(shiftRangeByMonths({ from: '2025-12-01', to: '2025-12-31' }, 1)).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('erhält Monatsenden — Stepping ist für Monats-Bereiche invertierbar', () => {
    // 30.06. ist Monatsende → wird zum Monatsende des Zielmonats (31.07.).
    expect(shiftRangeByMonths({ from: '2026-05-01', to: '2026-06-30' }, 1)).toEqual({
      from: '2026-06-01',
      to: '2026-07-31',
    });
    // Rück- und Vorschritt heben sich auf.
    const back = shiftRangeByMonths({ from: '2026-06-01', to: '2026-07-31' }, -1);
    expect(back).toEqual({ from: '2026-05-01', to: '2026-06-30' });
    expect(shiftRangeByMonths(back, 1)).toEqual({ from: '2026-06-01', to: '2026-07-31' });
    // 28.02. im Nicht-Schaltjahr ist Monatsende → +1 Monat = 31.03.
    expect(shiftRangeByMonths({ from: '2026-02-28', to: '2026-02-28' }, 1)).toEqual({
      from: '2026-03-31',
      to: '2026-03-31',
    });
  });

  it('clamped Tage jenseits des Zielmonats-Endes, ohne mittlere Tage zu verschieben', () => {
    expect(shiftRangeByMonths({ from: '2026-03-31', to: '2026-03-31' }, -1)).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    // Schaltjahr: Februar 2028 hat 29 Tage.
    expect(shiftRangeByMonths({ from: '2028-03-31', to: '2028-03-31' }, -1)).toEqual({
      from: '2028-02-29',
      to: '2028-02-29',
    });
    // 30.01. ist NICHT Monatsende → bleibt der 30. im Zielmonat.
    expect(shiftRangeByMonths({ from: '2026-01-30', to: '2026-01-30' }, -1)).toEqual({
      from: '2025-12-30',
      to: '2025-12-30',
    });
  });

  it('reicht leere Endpunkte unverändert durch', () => {
    expect(shiftRangeByMonths({ from: '', to: '' }, -1)).toEqual({ from: '', to: '' });
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
