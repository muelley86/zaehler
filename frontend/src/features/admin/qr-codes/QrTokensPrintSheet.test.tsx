/**
 * Smoke-Tests für die Geometrie der drei Druck-Layouts und für die
 * Browser-Quirk-resistente HTML-Generierung.
 *
 * ``openTokensPrintWindow`` lässt sich in jsdom nicht sinnvoll testen
 * (kein realer Pop-up-Mechanismus, kein ``document.write``-Roundtrip,
 * kein ``window.print``), deshalb decken wir das ab, was am ehesten still
 * kaputtgeht: die Default-Layout-Geometrien müssen rechnerisch auf die
 * A4-Maße passen, und die HTML-Ausgabe muss so beschaffen sein, dass sie
 * im Firefox-about:blank-Fenster ohne externe Resource-Requests rendert.
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/tests/server';
import type { QrTokenRead } from '@/lib/types';

import {
  buildPrintHtml,
  DEFAULT_LAYOUTS,
  fetchSvgsWithConcurrency,
  LAYOUT_ORDER,
  type TokenWithSvg,
} from './QrTokensPrintSheet';

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>';

function makeToken(overrides: Partial<TokenWithSvg> = {}): TokenWithSvg {
  return {
    id: 1,
    token: 'K7MP3X9F',
    measuring_point_id: 1,
    measuring_point_name: 'Hauptzähler Strom',
    created_at: '2026-01-01T00:00:00Z',
    created_by_user_id: 1,
    assigned_at: null,
    assigned_by_user_id: null,
    svg: SAMPLE_SVG,
    ...overrides,
  };
}

describe('Druck-Layouts', () => {
  it('listet beide Layouts in stabiler Reihenfolge', () => {
    expect(LAYOUT_ORDER).toEqual(['cut-2x4', 'avery-l6008']);
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

  it('L6008-20 liefert genau 189 Etiketten pro Bogen', () => {
    const l = DEFAULT_LAYOUTS['avery-l6008'];
    expect(l.cols * l.rows).toBe(189);
  });

  it('Schnitt-Bogen 2×4 liefert 8 Etiketten pro Bogen', () => {
    const l = DEFAULT_LAYOUTS['cut-2x4'];
    expect(l.cols * l.rows).toBe(8);
  });
});

describe('buildPrintHtml — Browser-Quirk-resistente Generierung', () => {
  // Regression: Firefox blockiert in einem ``about:blank``-Pop-up sowohl
  // ``<img src="/api/v1/...">`` als auch ``<script src="/api/v1/...">``,
  // weil die CSP ``'self'`` nicht gegen die Opener-Origin matcht. Außerdem
  // werden ``SameSite=Strict``-Cookies bei Subresource-Requests aus
  // about:blank nicht mitgesendet → 401 auf Admin-Only-Endpoints.
  // Konsequenz: Das Druck-HTML darf KEINE App-Resources mehr referenzieren.
  // Die SVGs werden im Opener vorab gefetcht und inline eingebettet,
  // Click-Handler werden vom Opener aus per addEventListener gesetzt.

  it('bettet das SVG inline ein — kein <img src> mehr', () => {
    const html = buildPrintHtml([makeToken()], DEFAULT_LAYOUTS['cut-2x4']);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).not.toMatch(/<img[^>]*src=/i);
  });

  it('referenziert kein Bootstrap-Skript per <script src>', () => {
    const html = buildPrintHtml([makeToken()], DEFAULT_LAYOUTS['cut-2x4']);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(html).not.toContain('print-bootstrap.js');
  });

  it('referenziert keine /api/v1/-Endpoints (weder Bilder noch Skripte)', () => {
    const html = buildPrintHtml([makeToken()], DEFAULT_LAYOUTS['avery-l6008']);
    expect(html).not.toContain('/api/v1/');
  });

  it('schreibt die Buttons mit data-action für externe Click-Handler', () => {
    const html = buildPrintHtml([makeToken()], DEFAULT_LAYOUTS['cut-2x4']);
    expect(html).toContain('data-action="print"');
    expect(html).toContain('data-action="close"');
    // Defensive: keine Inline-onclick-Handler, die unter strikter CSP
    // ohnehin blockiert würden.
    expect(html).not.toMatch(/onclick=/i);
  });

  it('escapt Token und MP-Name im Output (kein HTML-Injection-Risiko)', () => {
    const html = buildPrintHtml(
      [makeToken({ token: '<script>X</script>', measuring_point_name: 'A & B' })],
      DEFAULT_LAYOUTS['cut-2x4'],
    );
    expect(html).not.toContain('<script>X</script>');
    expect(html).toContain('&lt;script&gt;X&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('verteilt Tokens über mehrere Seiten, sobald cols × rows überschritten ist', () => {
    const layout = DEFAULT_LAYOUTS['cut-2x4']; // 8 pro Bogen
    const tokens = Array.from({ length: 9 }, (_, i) =>
      makeToken({ id: i, token: `T${i}`.padEnd(8, '0') }),
    );
    const html = buildPrintHtml(tokens, layout);
    const pageMatches = html.match(/<div class="page">/g);
    expect(pageMatches).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// fetchSvgsWithConcurrency
// ---------------------------------------------------------------------------

function makeBareToken(token: string): QrTokenRead {
  return {
    id: Number(token.replace(/\D/g, '')) || 0,
    token,
    measuring_point_id: null,
    measuring_point_name: null,
    created_at: '2025-07-01T00:00:00Z',
    created_by_user_id: 1,
    assigned_at: null,
    assigned_by_user_id: null,
  };
}

describe('fetchSvgsWithConcurrency', () => {
  it('liefert die SVGs in Token-Reihenfolge zurueck', async () => {
    server.use(
      http.get('/api/v1/qr-tokens/:t/qr', ({ params }) =>
        HttpResponse.text(`<svg data-id="${String(params['t'])}"></svg>`, {
          headers: { 'Content-Type': 'image/svg+xml' },
        }),
      ),
    );
    const tokens = ['TOK1', 'TOK2', 'TOK3'].map(makeBareToken);
    const result = await fetchSvgsWithConcurrency(tokens);
    expect(result.map((r) => r.token)).toEqual(['TOK1', 'TOK2', 'TOK3']);
    expect(result[0]?.svg).toContain('data-id="TOK1"');
    expect(result[2]?.svg).toContain('data-id="TOK3"');
  });

  it('begrenzt die parallelen Requests auf 8 (Pool-Schutz)', async () => {
    let active = 0;
    let maxActive = 0;
    server.use(
      http.get('/api/v1/qr-tokens/:t/qr', async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return HttpResponse.text('<svg></svg>', {
          headers: { 'Content-Type': 'image/svg+xml' },
        });
      }),
    );
    const tokens = Array.from({ length: 50 }, (_, i) => makeBareToken(`TOK${i}`));
    await fetchSvgsWithConcurrency(tokens);
    expect(maxActive).toBeGreaterThan(0);
    expect(maxActive).toBeLessThanOrEqual(8);
  });

  it('versucht bei 5xx ein paar Wiederholungen, bevor er aufgibt', async () => {
    let attempts = 0;
    server.use(
      http.get('/api/v1/qr-tokens/:t/qr', () => {
        attempts++;
        if (attempts < 3) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.text('<svg></svg>', {
          headers: { 'Content-Type': 'image/svg+xml' },
        });
      }),
    );
    const result = await fetchSvgsWithConcurrency([makeBareToken('FLAKY1')]);
    expect(attempts).toBe(3);
    expect(result).toHaveLength(1);
    expect(result[0]?.svg).toContain('<svg');
  });
});
