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

import { DEFAULT_LAYOUTS, LAYOUT_ORDER } from './QrTokensPrintSheet';

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
