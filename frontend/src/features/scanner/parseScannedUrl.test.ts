/**
 * Tests für parseScannedUrl — die Pure-Helper-Funktion, die aus dem
 * dekodierten QR-Inhalt eine validierte ``{mp:number}``-Struktur extrahiert.
 *
 * Die Sicherheits-Invariante (kein Cross-Origin-Hijack) wird hier abgesichert:
 * Wir geben nur die MP-ID zurück, niemals den Hostname.
 */

import { describe, expect, it } from 'vitest';

import { parseScannedUrl } from './parseScannedUrl';

describe('parseScannedUrl', () => {
  it('parst eine vollständige URL mit ?mp=', () => {
    expect(parseScannedUrl('https://zaehler.example/erfassen?mp=42')).toEqual({ mp: 42 });
  });

  it('parst auch http-URLs und andere Ports', () => {
    expect(parseScannedUrl('http://192.168.1.10:8000/erfassen?mp=7')).toEqual({ mp: 7 });
  });

  it('parst einen relativen Pfad mit ?mp=', () => {
    expect(parseScannedUrl('/erfassen?mp=3')).toEqual({ mp: 3 });
  });

  it('toleriert Trailing-Slashes', () => {
    expect(parseScannedUrl('https://host/erfassen/?mp=11')).toEqual({ mp: 11 });
  });

  it('liefert null für nicht-numerische mp', () => {
    expect(parseScannedUrl('https://host/erfassen?mp=abc')).toBeNull();
  });

  it('liefert null für negative oder 0 mp', () => {
    expect(parseScannedUrl('https://host/erfassen?mp=0')).toBeNull();
    expect(parseScannedUrl('https://host/erfassen?mp=-5')).toBeNull();
  });

  it('liefert null wenn mp fehlt', () => {
    expect(parseScannedUrl('https://host/erfassen')).toBeNull();
  });

  it('liefert null bei fremdem Pfad (kein /erfassen)', () => {
    expect(parseScannedUrl('https://host/admin?mp=1')).toBeNull();
    expect(parseScannedUrl('/messstellen?mp=1')).toBeNull();
    expect(parseScannedUrl('/erfassen2?mp=1')).toBeNull();
  });

  it('liefert null für Garbage-Input', () => {
    expect(parseScannedUrl('')).toBeNull();
    expect(parseScannedUrl('   ')).toBeNull();
    expect(parseScannedUrl('not-a-url-at-all')).toBeNull();
    expect(parseScannedUrl('javascript:alert(1)')).toBeNull();
  });

  it('verwirft mp mit nicht-decimalen Suffixen', () => {
    expect(parseScannedUrl('/erfassen?mp=12abc')).toBeNull();
    expect(parseScannedUrl('/erfassen?mp=12.5')).toBeNull();
  });
});
