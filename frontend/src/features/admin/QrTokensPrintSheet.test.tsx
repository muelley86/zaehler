/**
 * Smoke-Tests für die Geometrie der drei Druck-Layouts.
 *
 * ``openTokensPrintWindow`` lässt sich in jsdom nicht sinnvoll testen
 * (kein realer Pop-up-Mechanismus, kein ``document.write``-Roundtrip),
 * deshalb decken wir das ab, was am ehesten still kaputtgeht: die
 * Default-Layout-Geometrien müssen rechnerisch auf die A4-Maße passen
 * und die Etiketten-Positionierung muss reproduzierbar sein.
 */

import { describe, expect, it } from 'vitest';

import type { QrTokenRead } from '@/lib/types';

import { buildPrintHtml, DEFAULT_LAYOUTS, LAYOUT_ORDER } from './QrTokensPrintSheet';

describe('Druck-Layouts', () => {
  it('listet alle drei Layouts in stabiler Reihenfolge', () => {
    expect(LAYOUT_ORDER).toEqual(['cut-2x4', 'avery-l4731rev', 'avery-3320']);
  });

  for (const id of LAYOUT_ORDER) {
    const layout = DEFAULT_LAYOUTS[id];

    describe(`${layout.name} (${id})`, () => {
      it('Etiketten passen horizontal aufs Blatt', () => {
        const lastColLeft = layout.marginLeftMm + (layout.cols - 1) * layout.hPitchMm;
        const lastColRight = lastColLeft + layout.labelWidthMm;
        expect(lastColRight).toBeLessThanOrEqual(layout.pageWidthMm);
      });

      it('Etiketten passen vertikal aufs Blatt', () => {
        const lastRowTop = layout.marginTopMm + (layout.rows - 1) * layout.vPitchMm;
        const lastRowBottom = lastRowTop + layout.labelHeightMm;
        expect(lastRowBottom).toBeLessThanOrEqual(layout.pageHeightMm);
      });

      it('Pitch ist mindestens so groß wie das Etikett (sonst überlappen sich Felder)', () => {
        expect(layout.hPitchMm).toBeGreaterThanOrEqual(layout.labelWidthMm);
        expect(layout.vPitchMm).toBeGreaterThanOrEqual(layout.labelHeightMm);
      });
    });
  }

  it('L4731REV liefert genau 189 Etiketten pro Bogen', () => {
    const l = DEFAULT_LAYOUTS['avery-l4731rev'];
    expect(l.cols * l.rows).toBe(189);
  });

  it('Avery 3320 / 32×10-R liefert genau 44 Etiketten pro Bogen', () => {
    const l = DEFAULT_LAYOUTS['avery-3320'];
    expect(l.cols * l.rows).toBe(44);
  });

  it('Schnitt-Bogen 2×4 liefert 8 Etiketten pro Bogen', () => {
    const l = DEFAULT_LAYOUTS['cut-2x4'];
    expect(l.cols * l.rows).toBe(8);
  });
});

describe('buildPrintHtml — Cross-Browser-Resolving relativer URLs', () => {
  // Regression: In Firefox bleibt die Document-Base eines via
  // ``window.open('') + document.write()`` befüllten Fensters
  // ``about:blank``. Ohne explizites <base> laden weder die QR-SVGs
  // (sichtbar als Alt-Text statt Bild) noch das Bootstrap-Script
  // (Drucken-Button reagiert nicht). Chrome erbt die Opener-Origin
  // automatisch — daher fällt der Bug nur in Firefox auf.
  const tokens: QrTokenRead[] = [
    {
      id: 1,
      token: 'K7MP3X9F',
      measuring_point_id: 1,
      measuring_point_name: 'Hauptzähler Strom',
      created_at: '2026-01-01T00:00:00Z',
      created_by_user_id: 1,
      assigned_at: null,
      assigned_by_user_id: null,
    },
  ];

  it('schreibt ein <base href> mit Trailing-Slash auf Basis der Opener-Origin', () => {
    const html = buildPrintHtml(tokens, DEFAULT_LAYOUTS['cut-2x4'], 'https://app.example.com');
    expect(html).toContain('<base href="https://app.example.com/" />');
  });

  it('escapt die Origin im <base href> (defensiv gegen exotische Hostnamen)', () => {
    const html = buildPrintHtml(tokens, DEFAULT_LAYOUTS['cut-2x4'], 'https://x.example.com/"><script>');
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('nutzt weiterhin relative Pfade für QR-SVGs und Bootstrap (auflösen via <base>)', () => {
    const html = buildPrintHtml(tokens, DEFAULT_LAYOUTS['cut-2x4'], 'https://app.example.com');
    expect(html).toContain('src="/api/v1/qr-tokens/K7MP3X9F/qr?format=svg&size=large"');
    expect(html).toContain('<script src="/api/v1/qr-tokens/print-bootstrap.js">');
  });
});
