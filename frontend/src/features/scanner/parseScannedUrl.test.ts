/**
 * Tests für parseScannedUrl — extrahiert sowohl Token (neu) als auch
 * MP-ID (Legacy).
 *
 * Sicherheits-Invariante (kein Cross-Origin-Hijack) bleibt: wir geben
 * niemals den Hostname zurück.
 */

import { describe, expect, it } from 'vitest';

import { parseScannedUrl } from './parseScannedUrl';

describe('parseScannedUrl — Token (neuer Pfad)', () => {
  it('parst eine vollständige URL mit ?token=', () => {
    expect(parseScannedUrl('https://zaehler.example/erfassen?token=K7MP3X9F')).toEqual({
      kind: 'token',
      token: 'K7MP3X9F',
    });
  });

  it('parst einen relativen Pfad mit ?token=', () => {
    expect(parseScannedUrl('/erfassen?token=ABCDEFGH')).toEqual({
      kind: 'token',
      token: 'ABCDEFGH',
    });
  });

  it('normalisiert Kleinbuchstaben zu Großschreibung', () => {
    expect(parseScannedUrl('/erfassen?token=k7mp3x9f')).toEqual({
      kind: 'token',
      token: 'K7MP3X9F',
    });
  });

  it('lehnt zu kurzen Token ab', () => {
    expect(parseScannedUrl('/erfassen?token=ABCDEFG')).toBeNull();
  });

  it('lehnt zu langen Token ab', () => {
    expect(parseScannedUrl('/erfassen?token=ABCDEFGHIJ')).toBeNull();
  });

  it('lehnt Token mit unerlaubten Zeichen ab (I, L, O, U)', () => {
    expect(parseScannedUrl('/erfassen?token=ILOU0000')).toBeNull();
  });

  it('Token hat Vorrang vor mp wenn beide gesetzt sind', () => {
    const result = parseScannedUrl('/erfassen?token=ABCDEFGH&mp=42');
    expect(result).toEqual({ kind: 'token', token: 'ABCDEFGH' });
  });
});

describe('parseScannedUrl — MP-ID (Legacy-Pfad)', () => {
  it('parst eine vollständige URL mit ?mp=', () => {
    expect(parseScannedUrl('https://zaehler.example/erfassen?mp=42')).toEqual({
      kind: 'mp',
      mp: 42,
    });
  });

  it('parst einen relativen Pfad mit ?mp=', () => {
    expect(parseScannedUrl('/erfassen?mp=3')).toEqual({ kind: 'mp', mp: 3 });
  });

  it('toleriert Trailing-Slashes', () => {
    expect(parseScannedUrl('https://host/erfassen/?mp=11')).toEqual({ kind: 'mp', mp: 11 });
  });

  it('liefert null für nicht-numerische mp', () => {
    expect(parseScannedUrl('https://host/erfassen?mp=abc')).toBeNull();
  });

  it('liefert null für mp=0 oder negative', () => {
    expect(parseScannedUrl('https://host/erfassen?mp=0')).toBeNull();
    expect(parseScannedUrl('https://host/erfassen?mp=-5')).toBeNull();
  });
});

describe('parseScannedUrl — Garbage', () => {
  it('liefert null wenn weder mp noch token gesetzt ist', () => {
    expect(parseScannedUrl('https://host/erfassen')).toBeNull();
  });

  it('liefert null bei fremdem Pfad', () => {
    expect(parseScannedUrl('https://host/admin?token=ABCDEFGH')).toBeNull();
    expect(parseScannedUrl('/messstellen?mp=1')).toBeNull();
    expect(parseScannedUrl('/erfassen2?token=ABCDEFGH')).toBeNull();
  });

  it('liefert null für Garbage-Input', () => {
    expect(parseScannedUrl('')).toBeNull();
    expect(parseScannedUrl('   ')).toBeNull();
    expect(parseScannedUrl('not-a-url-at-all')).toBeNull();
    expect(parseScannedUrl('javascript:alert(1)')).toBeNull();
  });
});
