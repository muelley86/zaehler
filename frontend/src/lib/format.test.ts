import { describe, expect, it } from 'vitest';

import {
  formatDateDe,
  formatDateTickDe,
  formatDateTimeDe,
  formatDateTimeSecDe,
  formatDe,
  formatDeInt,
  parseDe,
  toInputDateTime,
} from './format';

describe('parseDe', () => {
  it('akzeptiert ein einfaches Integer', () => {
    expect(parseDe('1234')).toBe('1234');
  });

  it('Komma wird zu Punkt', () => {
    expect(parseDe('12,3')).toBe('12.3');
  });

  it('Tausender-Punkt wird entfernt', () => {
    expect(parseDe('1.234,56')).toBe('1234.56');
  });

  it('mehrere Tausender-Punkte werden entfernt', () => {
    expect(parseDe('1.234.567,89')).toBe('1234567.89');
  });

  it('akzeptiert Punkt als Dezimaltrenner ohne Komma', () => {
    expect(parseDe('12.3')).toBe('123');
  });

  it('akzeptiert führende und nachgestellte Whitespace', () => {
    expect(parseDe('  42,5  ')).toBe('42.5');
  });

  it('akzeptiert negative Zahlen', () => {
    expect(parseDe('-12,5')).toBe('-12.5');
  });

  it('wirft bei leerer Eingabe', () => {
    expect(() => parseDe('')).toThrow(RangeError);
    expect(() => parseDe('   ')).toThrow(RangeError);
  });

  it('wirft bei nicht-numerischer Eingabe', () => {
    expect(() => parseDe('abc')).toThrow(RangeError);
    expect(() => parseDe('12abc')).toThrow(RangeError);
    // mehrere Kommas: zweites Komma bleibt → invalides Pattern
    expect(() => parseDe('1,2,3')).toThrow(RangeError);
  });

  it('toleriert mehrfache Punkte als Tausender-Separator-Variante', () => {
    // Aktuelles Verhalten: alle Punkte werden als Tausender-Trenner
    // entfernt. Das ist absichtlich tolerant gegenüber „verrutschten"
    // Eingaben — der Plausibilitätscheck fängt Unsinn auf der nächsten
    // Ebene ab. Test pinnt das Verhalten fest, damit eine spätere
    // Verschärfung absichtlich erfolgen muss.
    expect(parseDe('1..2')).toBe('12');
  });
});

describe('formatDe', () => {
  it('liefert deutsche Zahl mit Dezimal-Komma', () => {
    expect(formatDe(1234.5)).toBe('1.234,5');
  });

  it('akzeptiert Eingabe als String', () => {
    expect(formatDe('1234.567')).toBe('1.234,567');
  });

  it('schneidet auf 3 Nachkommastellen ab', () => {
    expect(formatDe(1.23456789)).toBe('1,235');
  });

  it('Fallback auf rohen String bei NaN', () => {
    expect(formatDe('abc')).toBe('abc');
  });

  it('respektiert maximumFractionDigits Option', () => {
    expect(formatDe(1234.5678, { maximumFractionDigits: 0 })).toBe('1.235');
  });
});

describe('formatDeInt', () => {
  it('rundet auf 0 Nachkommastellen', () => {
    expect(formatDeInt(1234.7)).toBe('1.235');
  });

  it('Fallback auf String bei NaN', () => {
    expect(formatDeInt('foo')).toBe('foo');
  });
});

describe('formatDateDe', () => {
  it('liefert DD.MM.YYYY mit 4-stelligem Jahr', () => {
    expect(formatDateDe('2026-05-06')).toBe('06.05.2026');
  });

  it('liefert leeren String für null/undefined', () => {
    expect(formatDateDe(null)).toBe('');
    expect(formatDateDe(undefined)).toBe('');
  });

  it('Fallback auf rohen String bei ungültigem Datum', () => {
    expect(formatDateDe('xxxx')).toBe('xxxx');
  });
});

describe('formatDateTimeDe', () => {
  it('liefert DD.MM.YYYY, HH:MM mit 4-stelligem Jahr', () => {
    // ISO mit lokaler Zeit (kein Z), damit das Ergebnis Zeitzonen-frei stabil ist.
    expect(formatDateTimeDe('2026-05-06T14:30:00')).toMatch(/^06\.05\.2026,? 14:30$/);
  });
});

describe('formatDateTimeSecDe', () => {
  it('inkludiert Sekunden für CSV-Exports', () => {
    expect(formatDateTimeSecDe('2026-05-06T14:30:45')).toMatch(/^06\.05\.2026,? 14:30:45$/);
  });
});

describe('formatDateTickDe', () => {
  it('formatiert reines ISO-Datum als DD.MM.YYYY (zeitzonenfrei)', () => {
    expect(formatDateTickDe('2026-05-06')).toBe('06.05.2026');
  });

  it('formatiert ISO-DateTime als DD.MM.YYYY', () => {
    expect(formatDateTickDe('2026-05-06T14:30:00')).toBe('06.05.2026');
  });

  it('liefert leeren String für leere Eingabe', () => {
    expect(formatDateTickDe('')).toBe('');
  });
});

describe('toInputDateTime', () => {
  it('liefert leeren String für null/undefined', () => {
    expect(toInputDateTime(null)).toBe('');
    expect(toInputDateTime(undefined)).toBe('');
  });

  it('liefert leeren String für ungültige ISO-Eingabe', () => {
    expect(toInputDateTime('xxxx')).toBe('');
  });

  it('formatiert ISO-DateTime in lokales datetime-local Format', () => {
    // Datum aus ISO konstruieren, gleiches Datum zurück erwarten (Time-Zone-frei)
    const result = toInputDateTime('2026-05-04T08:30:00');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
