import { describe, expect, it } from 'vitest';

import {
  PENDING_CRITICAL_AGE_DAYS,
  PENDING_WARN_AGE_DAYS,
  pendingAgeDays,
  pendingAgeLevel,
  pendingBadgeClass,
} from './pendingAge';

const NOW = new Date('2026-07-11T12:00:00Z');

describe('pendingAgeDays', () => {
  it('liefert volle Tage seit createdAt', () => {
    expect(pendingAgeDays('2026-07-09T12:00:00Z', NOW)).toBe(2);
    expect(pendingAgeDays('2026-07-09T13:00:00Z', NOW)).toBe(1);
    expect(pendingAgeDays('2026-07-11T11:00:00Z', NOW)).toBe(0);
  });
});

describe('pendingAgeLevel', () => {
  it('ohne offene Einträge kein Level', () => {
    expect(pendingAgeLevel(null, NOW)).toBe('none');
  });

  it(`unter ${PENDING_WARN_AGE_DAYS} Tagen none`, () => {
    expect(pendingAgeLevel('2026-07-09T12:00:00Z', NOW)).toBe('none');
  });

  it(`ab ${PENDING_WARN_AGE_DAYS} Tagen warn`, () => {
    expect(pendingAgeLevel('2026-07-08T12:00:00Z', NOW)).toBe('warn');
    expect(pendingAgeLevel('2026-07-07T12:00:00Z', NOW)).toBe('warn');
  });

  it(`ab ${PENDING_CRITICAL_AGE_DAYS} Tagen critical`, () => {
    expect(pendingAgeLevel('2026-07-06T12:00:00Z', NOW)).toBe('critical');
    expect(pendingAgeLevel('2026-06-01T12:00:00Z', NOW)).toBe('critical');
  });

  it('unlesbares Datum → none (defensiv)', () => {
    expect(pendingAgeLevel('kaputt', NOW)).toBe('none');
  });
});

describe('pendingBadgeClass', () => {
  it('mappt das Alters-Level auf die Badge-Hintergrundklasse', () => {
    expect(pendingBadgeClass('none')).toBe('bg-primary');
    expect(pendingBadgeClass('warn')).toBe('bg-warning');
    expect(pendingBadgeClass('critical')).toBe('bg-danger');
  });
});
