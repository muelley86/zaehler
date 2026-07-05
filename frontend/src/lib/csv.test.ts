import { describe, expect, it } from 'vitest';

import { csvField } from './csv';

describe('csvField', () => {
  it('laesst harmlose Werte unveraendert', () => {
    expect(csvField('Keller')).toBe('Keller');
    expect(csvField('123,45')).toBe('123,45');
  });

  it('quotet Felder mit Semikolon, Anfuehrungszeichen oder Zeilenumbruch', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('sag "hallo"')).toBe('"sag ""hallo"""');
    expect(csvField('Zeile1\nZeile2')).toBe('"Zeile1\nZeile2"');
  });

  it('praefixt Formel-Injection-Werte (=,+,-,@) mit Apostroph (CWE-1236)', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('+49 170')).toBe("'+49 170");
    expect(csvField('-5')).toBe("'-5");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('kombiniert Formel-Praefix und Quoting bei Semikolon im Wert', () => {
    // fuehrendes = -> Apostroph, ausserdem ; -> quoten
    expect(csvField('=cmd;x')).toBe('"\'=cmd;x"');
  });
});
