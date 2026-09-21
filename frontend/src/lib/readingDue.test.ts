import { describe, expect, it } from 'vitest';

import { daysSince, isMeasuringPointDue, isReadingDue } from './readingDue';
import type { PhysicalMeterRead } from './types';

const now = new Date('2026-09-21T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe('isReadingDue', () => {
  it('nie abgelesen → fällig', () => {
    expect(isReadingDue(null, 35, now)).toBe(true);
    expect(daysSince(null, now)).toBeNull();
  });

  it('Grenze inklusiv: 34 Tage nicht fällig, 35 Tage fällig', () => {
    expect(isReadingDue(ago(34), 35, now)).toBe(false);
    expect(isReadingDue(ago(35), 35, now)).toBe(true);
  });

  it('nutzt das individuelle Intervall', () => {
    expect(isReadingDue(ago(8), 7, now)).toBe(true);
    expect(isReadingDue(ago(80), 90, now)).toBe(false);
  });

  it('fehlendes Intervall (alter Offline-Snapshot) → Default 35', () => {
    expect(isReadingDue(ago(35), undefined, now)).toBe(true);
    expect(isReadingDue(ago(34), undefined, now)).toBe(false);
  });
});

describe('isMeasuringPointDue', () => {
  const meter = (removed_at: string | null, is_active: boolean): PhysicalMeterRead => ({
    id: 1,
    serial_number: 'SN',
    installed_at: '2024-01-01',
    removed_at,
    transformer_factor: null,
    registers: [
      {
        id: 1,
        obis_code: '1.8.0',
        label: 'Bezug',
        unit: 'kWh',
        is_active,
        max_value: '0',
        accepts_deliveries: false,
      },
    ],
  });

  it('eingebauter Zähler mit aktivem Register, nie abgelesen → fällig', () => {
    const mp = { physical_meters: [meter(null, true)], last_reading_at: null };
    expect(isMeasuringPointDue(mp, now)).toBe(true);
  });

  it('kein eingebauter Zähler oder nur inaktive Register → nie fällig', () => {
    expect(isMeasuringPointDue({ physical_meters: [], last_reading_at: null }, now)).toBe(false);
    expect(
      isMeasuringPointDue(
        { physical_meters: [meter('2025-01-01', true)], last_reading_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      isMeasuringPointDue({ physical_meters: [meter(null, false)], last_reading_at: null }, now),
    ).toBe(false);
  });
});
