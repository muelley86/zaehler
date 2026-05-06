/**
 * Bulk-Druck für eine Auswahl an QR-Tokens.
 *
 * Drei Layouts werden unterstützt:
 *
 * 1. ``cut-2x4`` — Schnitt-Bogen 2×4, 95×65 mm pro Feld inkl. Token-Text
 *    und Messstellen-Namen. Default — die Etiketten werden ausgeschnitten
 *    und auf den Zähler geklebt.
 * 2. ``avery-l4731rev`` — Avery Zweckform L4731REV, 25,4 × 10 mm, 7×27
 *    = 189 Etiketten pro Bogen. Nur QR-Code, keine Beschriftung.
 * 3. ``avery-3320`` — Avery Zweckform 3320 / „32×10-R", 32 × 10 mm,
 *    4×11 = 44 Etiketten pro Bogen. Nur QR-Code, keine Beschriftung.
 *
 * Auf den Avery-Bögen (10 mm Höhe) wird der QR als 10 × 10 mm Quadrat
 * mittig zentriert. Die menschenlesbare Token-Bezeichnung („K7MP3X9F")
 * wird bewusst weggelassen — auf dieser Etikettengröße kostet sie Platz
 * ohne echten Mehrwert (zur Identifikation reicht der QR-Scan).
 *
 * Pattern: neues Fenster, HTML schreiben, ``window.print()`` triggern.
 * Wichtig: KEIN ``noopener`` beim ``window.open`` — sonst liefert der Call
 * laut Spec ``null`` zurück, und das ``document.write`` greift nie. Genau
 * das war der Grund, warum der Bulk-Druck zwischenzeitlich nur eine weiße
 * Seite zeigte (siehe Issue zur QR-Druck-Funktion).
 *
 * Hinweis Scannbarkeit: Der QR-Code enthält die volle URL
 * ``${origin}/erfassen?token=${token}`` (~50 Zeichen), das ergibt einen
 * Version-3-Code (29×29 Module). Bei 10 mm Etikettenhöhe sind die Module
 * ca. 0,3 mm groß — gerade noch scannbar mit modernen Smartphones, aber
 * empfindlich gegen Druckunschärfe. Für absolut zuverlässiges Scannen
 * weiterhin den Schnitt-Bogen 2×4 verwenden.
 */

import type { QrTokenRead } from '@/lib/types';

const PRINT_TIMEOUT_MS = 600;

export type LabelLayoutId = 'cut-2x4' | 'avery-l4731rev' | 'avery-3320';

/**
 * Geometrie eines Etikettenbogens. Alle Werte in Millimetern, sodass das
 * @page-Layout die exakten physischen Maße trifft.
 */
export interface LabelLayout {
  id: LabelLayoutId;
  name: string;
  /** Kurzbeschreibung für die UI (z.B. „189 Etiketten/Bogen"). */
  description: string;
  /** A4 Hochkant ist überall fest verdrahtet. */
  pageWidthMm: number;
  pageHeightMm: number;
  cols: number;
  rows: number;
  /** Abstand obere Blattkante → obere Kante des ersten Etiketts. */
  marginTopMm: number;
  /** Abstand linke Blattkante → linke Kante des ersten Etiketts. */
  marginLeftMm: number;
  /** Spaltenabstand (Etikett-Linke zu Etikett-Linke der nächsten Spalte). */
  hPitchMm: number;
  /** Zeilenabstand (Etikett-Oben zu Etikett-Oben der nächsten Zeile). */
  vPitchMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  /** Zeigt gestrichelten Rahmen zum Ausschneiden — nur für ``cut-2x4``. */
  showCutBorder: boolean;
  /** Zeigt Token-Text & Subline (MP-Name oder „frei"). */
  showLabelText: boolean;
  /** Anordnung des QR im Etikett: zentriert oder links mit Text rechts. */
  qrPlacement: 'center-with-caption' | 'left-with-text-right' | 'center-only';
}

/**
 * Default-Layout-Definitionen. Für Avery-Bögen sind die Margin/Pitch-Werte
 * gute Startpunkte, können aber printerabhängig minimal abweichen — die
 * Admin-UI erlaubt deshalb das Override pro Layout (siehe
 * :file:`QrCodesAdminPage.tsx`).
 */
export const DEFAULT_LAYOUTS: Record<LabelLayoutId, LabelLayout> = {
  'cut-2x4': {
    id: 'cut-2x4',
    name: 'Schnitt-Bogen 2 × 4',
    description: '95 × 65 mm, 8/Bogen — mit Token-Text & MP-Namen',
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 2,
    rows: 4,
    marginTopMm: 8,
    marginLeftMm: 8,
    hPitchMm: 97, // 95 mm Etikett + 2 mm Lücke
    vPitchMm: 67, // 65 mm Etikett + 2 mm Lücke
    labelWidthMm: 95,
    labelHeightMm: 65,
    showCutBorder: true,
    showLabelText: true,
    qrPlacement: 'center-with-caption',
  },
  'avery-l4731rev': {
    id: 'avery-l4731rev',
    name: 'Avery L4731REV',
    description: '25,4 × 10 mm, 7 × 27 = 189/Bogen — nur QR, ohne Beschriftung',
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 7,
    rows: 27,
    marginTopMm: 13.5,
    marginLeftMm: 8.6,
    hPitchMm: 27.9, // 25,4 mm Etikett + 2,5 mm Lücke
    vPitchMm: 10, // bündig — keine vertikale Lücke
    labelWidthMm: 25.4,
    labelHeightMm: 10,
    showCutBorder: false,
    showLabelText: false,
    qrPlacement: 'center-only',
  },
  'avery-3320': {
    id: 'avery-3320',
    name: 'Avery 3320 / 32×10-R',
    description: '32 × 10 mm, 4 × 11 = 44/Bogen — nur QR, ohne Beschriftung',
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 4,
    rows: 11,
    // Best-Guess-Defaults — bei Bedarf in der UI feinjustieren.
    marginTopMm: 13,
    marginLeftMm: 8,
    hPitchMm: 49, // 32 mm Etikett + 17 mm Lücke
    vPitchMm: 25, // 10 mm Etikett + 15 mm Lücke
    labelWidthMm: 32,
    labelHeightMm: 10,
    showCutBorder: false,
    showLabelText: false,
    qrPlacement: 'center-only',
  },
};

export const LAYOUT_ORDER: LabelLayoutId[] = ['cut-2x4', 'avery-l4731rev', 'avery-3320'];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLabelInner(token: QrTokenRead, layout: LabelLayout): string {
  const qrUrl = `/api/v1/qr-tokens/${token.token}/qr?format=svg&size=large`;
  const subline = token.measuring_point_name
    ? escapeHtml(token.measuring_point_name)
    : 'Bereit zur Zuordnung';

  if (layout.qrPlacement === 'center-with-caption' && layout.showLabelText) {
    return `
      <div class="qr-center"><img src="${qrUrl}" alt="QR ${escapeHtml(token.token)}" /></div>
      <div class="token">${escapeHtml(token.token)}</div>
      <div class="sub">${subline}</div>`;
  }
  if (layout.qrPlacement === 'left-with-text-right') {
    const text = layout.showLabelText
      ? `<div class="text-block">
           <div class="token-small">${escapeHtml(token.token)}</div>
         </div>`
      : '';
    return `
      <div class="qr-square"><img src="${qrUrl}" alt="QR ${escapeHtml(token.token)}" /></div>
      ${text}`;
  }
  // center-only
  return `
    <div class="qr-fill"><img src="${qrUrl}" alt="QR ${escapeHtml(token.token)}" /></div>`;
}

/**
 * Verteilt die Tokens auf Seiten gemäß ``cols × rows`` des Layouts und
 * erzeugt für jede Seite ein ``.page``-DIV mit absolut positionierten
 * Etiketten. Das @page-CSS hat 0-Margin — alle physischen Abstände stehen
 * im Layout selbst, sodass Avery-Bögen pixelgenau sitzen.
 */
function buildPagesHtml(tokens: QrTokenRead[], layout: LabelLayout): string {
  const perPage = layout.cols * layout.rows;
  const pages: QrTokenRead[][] = [];
  for (let i = 0; i < tokens.length; i += perPage) {
    pages.push(tokens.slice(i, i + perPage));
  }

  return pages
    .map((pageTokens) => {
      const labels = pageTokens
        .map((token, idx) => {
          const col = idx % layout.cols;
          const row = Math.floor(idx / layout.cols);
          const left = layout.marginLeftMm + col * layout.hPitchMm;
          const top = layout.marginTopMm + row * layout.vPitchMm;
          return `
            <div class="label" style="left:${left}mm;top:${top}mm;width:${layout.labelWidthMm}mm;height:${layout.labelHeightMm}mm;">
              ${buildLabelInner(token, layout)}
            </div>`;
        })
        .join('');
      return `<div class="page">${labels}</div>`;
    })
    .join('');
}

function buildPrintHtml(tokens: QrTokenRead[], layout: LabelLayout): string {
  const pagesHtml = buildPagesHtml(tokens, layout);
  const cutBorder = layout.showCutBorder ? '0.3mm dashed #999' : 'none';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>QR-Codes (${tokens.length}) — ${escapeHtml(layout.name)}</title>
<style>
  @page { size: ${layout.pageWidthMm}mm ${layout.pageHeightMm}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
    color: #111;
    background: #fff;
  }
  .page {
    position: relative;
    width: ${layout.pageWidthMm}mm;
    height: ${layout.pageHeightMm}mm;
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }
  .label {
    position: absolute;
    border: ${cutBorder};
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-inside: avoid;
  }

  /* Layout: zentrierter QR + Token + MP-Name (Schnitt-Bogen) */
  .label .qr-center {
    width: 38mm;
    height: 38mm;
  }
  .label .qr-center img { width: 100%; height: 100%; display: block; }
  .label > .token {
    position: absolute;
    bottom: 9mm;
    left: 0; right: 0;
    text-align: center;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .label > .sub {
    position: absolute;
    bottom: 4mm;
    left: 4mm; right: 4mm;
    text-align: center;
    font-size: 9pt;
    color: #555;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Beim cut-Layout den QR nach oben rücken, Text bleibt unten */
  .label:has(.qr-center) {
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 5mm;
  }

  /* Layout: QR links, Text rechts (Avery) */
  .label .qr-square {
    flex: 0 0 auto;
    height: 100%;
    aspect-ratio: 1 / 1;
    padding: 0.4mm;
  }
  .label .qr-square img { width: 100%; height: 100%; display: block; }
  .label .text-block {
    flex: 1 1 auto;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 0 1mm;
    overflow: hidden;
  }
  .label .text-block .token-small {
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1;
    white-space: nowrap;
  }

  /* Layout: nur QR — quadratisch, in der Etikettenmitte zentriert.
     Bei Landscape-Etiketten (32×10, 25,4×10) ist die kürzere Seite die
     Höhe, also wird der QR auf Etiketten-Höhe begrenzt und automatisch
     horizontal zentriert (flex justify-content: center am Parent). */
  .label .qr-fill {
    height: 100%;
    aspect-ratio: 1 / 1;
    width: auto;
  }
  .label .qr-fill img { width: 100%; height: 100%; display: block; }

  /* Bedienleiste — nur am Bildschirm sichtbar */
  .controls {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 999px;
    padding: 6px 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    font-size: 12px;
    z-index: 9999;
  }
  .controls button {
    border: 0;
    background: #1463ff;
    color: #fff;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
  }
  .controls button.secondary {
    background: #efefef;
    color: #111;
  }
  .controls .info {
    color: #555;
    padding: 4px 4px 4px 8px;
  }
  @media print {
    .controls { display: none !important; }
  }
</style>
</head>
<body>
  ${pagesHtml}
  <div class="controls">
    <span class="info">${tokens.length} QR · ${escapeHtml(layout.name)}</span>
    <button onclick="window.print()">Drucken</button>
    <button class="secondary" onclick="window.close()">Schließen</button>
  </div>
  <script>
    (function () {
      var imgs = Array.from(document.images);
      var pending = imgs.length;
      function go() {
        setTimeout(function () { window.focus(); window.print(); }, ${PRINT_TIMEOUT_MS});
      }
      if (pending === 0) { go(); return; }
      imgs.forEach(function (img) {
        if (img.complete) {
          if (--pending === 0) go();
        } else {
          var done = function () { if (--pending === 0) go(); };
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        }
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Öffnet ein neues Fenster mit dem Bulk-Druck-Layout für die übergebenen
 * Tokens. Liefert ``true``, wenn das Fenster geöffnet werden konnte.
 *
 * Wichtig: ``window.open`` ohne ``noopener`` aufrufen, sonst gibt der
 * Browser ``null`` zurück und ``document.write`` läuft nicht. Same-origin,
 * Inhalt komplett kontrolliert — kein Sicherheitsproblem.
 */
export function openTokensPrintWindow(tokens: QrTokenRead[], layout: LabelLayout): boolean {
  if (tokens.length === 0) return false;
  const w = window.open('', '_blank', 'width=900,height=900');
  if (!w) return false;
  w.document.open();
  w.document.write(buildPrintHtml(tokens, layout));
  w.document.close();
  return true;
}
