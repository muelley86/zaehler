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
 * Architektur des Druck-Fensters
 * ------------------------------
 * Wir öffnen ein ``about:blank``-Pop-up und schreiben das HTML per
 * ``document.write``. Dabei sind drei Browser-Quirks zu beachten — alle
 * drei zeigen sich primär in Firefox, weil Chrome an diesen Stellen
 * großzügiger ist (was die ursprüngliche Implementierung „funktioniert
 * doch in Chrome" verschleiert hat):
 *
 *  1. ``window.open(url, '_blank', 'noopener')`` liefert laut Spec ``null``
 *     zurück — damit greift das frühe return und das ``document.write``
 *     läuft nie (sichtbar als weiße Seite). Daher KEIN noopener.
 *  2. Das ``about:blank``-Fenster erbt die CSP des Openers (``script-src
 *     'self'``, ``img-src 'self'``). In Firefox matcht ``'self'`` für ein
 *     Document mit URL ``about:blank`` nicht gegen die App-Origin —
 *     externe ``<script src="/api/v1/...">`` und ``<img src="/api/v1/...">``
 *     werden blockiert. Gleiches Problem auf der Cookie-Seite: das
 *     Session-Cookie ist ``SameSite=Strict``, und Subresource-Requests aus
 *     einem ``about:blank``-Fenster gelten in Firefox nicht als
 *     same-site → 401 auf den Admin-Only QR-Endpoint.
 *     **Konsequenz**: Das Druck-HTML referenziert KEINE App-Resources
 *     mehr. Die QR-SVGs werden vorab im Opener-Kontext per ``fetch``
 *     geladen (echte App-Origin → Cookies und CSP problemlos) und inline
 *     ins HTML eingebettet. Klick-Handler werden vom Opener aus per
 *     ``addEventListener`` an die Buttons gehängt — keine Inline-Scripts,
 *     kein externes Bootstrap-Skript.
 *  3. ``window.open`` darf in Firefox nur synchron aus einem
 *     User-Gesture aufgerufen werden — nach einem ``await`` ist die
 *     Activation aufgebraucht und Pop-ups werden geblockt. Wir öffnen
 *     deshalb sofort beim Click ein leeres Fenster mit „lädt …"-Hinweis
 *     und schreiben den finalen HTML-Body erst, nachdem die SVGs da sind.
 */

import type { QrTokenRead } from '@/lib/types';

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

/**
 * Token mit zugehörigem inline-SVG-String — interner Druck-Typ.
 *
 * @internal Exportiert NUR für die Test-Suite, produktiv landet er via
 * ``openTokensPrintWindow`` automatisch im HTML-Generator.
 */
export interface TokenWithSvg extends QrTokenRead {
  svg: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Bereinigt das vom Backend gelieferte SVG für die Inline-Einbettung:
 *
 * - XML-Prolog ``<?xml … ?>`` und ``<!DOCTYPE …>`` raus, weil ein Inline-SVG
 *   in einer ``text/html``-Page keinen XML-Header haben darf (Firefox
 *   meckert sonst mit „XML-Verarbeitungsanweisung an unzulässiger Stelle").
 * - Feste ``width=""``/``height=""``-Attribute am ``<svg>``-Wurzelelement
 *   raus, damit das CSS (``svg { width:100%; height:100%; }``) greift.
 *   Das ``viewBox``-Attribut bleibt erhalten — ohne das könnte das SVG
 *   nicht skalieren.
 *
 * Defensive Implementierung: kommt das Backend-Format mal ohne XML-Prolog
 * oder ohne width/height, ist das auch ok (regex matcht dann nichts).
 */
function sanitizeSvgForInline(raw: string): string {
  let svg = raw
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
  svg = svg.replace(/(<svg\b[^>]*?)\swidth="[^"]*"/i, '$1');
  svg = svg.replace(/(<svg\b[^>]*?)\sheight="[^"]*"/i, '$1');
  return svg;
}

// Max parallele SVG-Requests beim Bulk-Druck. Browser begrenzen HTTP/2-
// Streams ohnehin in dieser Groessenordnung; auf der Server-Seite
// vermeidet das Limit, dass Threadpool- und DB-Connection-Pool-Limits
// unter ~200 parallelen Anfragen reissen (das war die Ursache des
// „HTTP 500"-Fehlers bei einem 189er-Avery-Bogen).
const PRINT_SVG_CONCURRENCY = 8;

async function fetchTokenSvgOnce(tokenStr: string): Promise<string> {
  // Same-origin-Fetch im Opener-Kontext — Cookies, CSP und Origin sind hier
  // alle „normal", anders als später im about:blank-Fenster.
  const r = await fetch(
    `/api/v1/qr-tokens/${encodeURIComponent(tokenStr)}/qr?format=svg&size=large`,
    {
      credentials: 'same-origin',
      headers: { Accept: 'image/svg+xml' },
    },
  );
  if (!r.ok) {
    // Wenn das Backend einen problem+json-Body mitschickt, ueberneh wir
    // ``detail`` — damit sehen wir bei sporadischen 5xx auf einen Blick,
    // ob es ein Pool-Timeout, Pillow- oder ein anderer Fehler war.
    let detail = '';
    try {
      const body = (await r.clone().json()) as { detail?: string };
      if (typeof body.detail === 'string' && body.detail) detail = ` — ${body.detail}`;
    } catch {
      /* nicht-JSON-Body, ignorieren */
    }
    const err: Error & { status?: number } = new Error(
      `QR-SVG für ${tokenStr} konnte nicht geladen werden (HTTP ${r.status})${detail}`,
    );
    err.status = r.status;
    throw err;
  }
  return sanitizeSvgForInline(await r.text());
}

async function fetchTokenSvg(tokenStr: string): Promise<string> {
  // Bis zu 2 Wiederholungen bei serverseitigen 5xx — kompensiert sporadische
  // Threadpool-/Connection-Pool-Glitches, ohne den User mit einer fehlge-
  // schlagenen Bogen-Vorbereitung zu blockieren. 4xx wird sofort weiter-
  // geworfen (kein retry, das ist ein dauerhafter Fehler).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchTokenSvgOnce(tokenStr);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== undefined && status < 500) throw err;
      lastErr = err;
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 + attempt * 250));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Verarbeitet Tokens mit beschraenkter Parallelitaet — wartet, bis ein
 * Slot frei wird, bevor der naechste Request startet. Aequivalent zu
 * ``p-limit(PRINT_SVG_CONCURRENCY)`` ohne neue Dependency. Exportiert
 * fuer Unit-Tests.
 */
export async function fetchSvgsWithConcurrency(tokens: QrTokenRead[]): Promise<TokenWithSvg[]> {
  const result: (TokenWithSvg | undefined)[] = new Array<TokenWithSvg | undefined>(tokens.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tokens.length) {
      const i = next++;
      const t = tokens[i];
      if (!t) continue;
      const svg = await fetchTokenSvg(t.token);
      result[i] = { ...t, svg };
    }
  }
  const workers = Array.from({ length: Math.min(PRINT_SVG_CONCURRENCY, tokens.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  // Alle Indizes belegt — ``continue`` im Worker greift nur, wenn der
  // Token-Index ungueltig waere (kann hier nicht passieren). Cast ist
  // safe, gibt mypy/eslint Ruhe.
  return result as TokenWithSvg[];
}

function buildLabelInner(token: TokenWithSvg, layout: LabelLayout): string {
  const subline = token.measuring_point_name
    ? escapeHtml(token.measuring_point_name)
    : 'Bereit zur Zuordnung';

  if (layout.qrPlacement === 'center-with-caption' && layout.showLabelText) {
    return `
      <div class="qr-center" role="img" aria-label="QR ${escapeHtml(token.token)}">${token.svg}</div>
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
      <div class="qr-square" role="img" aria-label="QR ${escapeHtml(token.token)}">${token.svg}</div>
      ${text}`;
  }
  // center-only
  return `
    <div class="qr-fill" role="img" aria-label="QR ${escapeHtml(token.token)}">${token.svg}</div>`;
}

/**
 * Verteilt die Tokens auf Seiten gemäß ``cols × rows`` des Layouts und
 * erzeugt für jede Seite ein ``.page``-DIV mit absolut positionierten
 * Etiketten. Das @page-CSS hat 0-Margin — alle physischen Abstände stehen
 * im Layout selbst, sodass Avery-Bögen pixelgenau sitzen.
 */
function buildPagesHtml(tokens: TokenWithSvg[], layout: LabelLayout): string {
  const perPage = layout.cols * layout.rows;
  const pages: TokenWithSvg[][] = [];
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

/** @internal — exportiert für Tests; produktiv nur über ``openTokensPrintWindow``. */
export function buildPrintHtml(tokens: TokenWithSvg[], layout: LabelLayout): string {
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

  /* Inline-SVGs füllen ihre Container vollständig — feste width/height am
     <svg>-Element wurden in sanitizeSvgForInline() entfernt, sodass diese
     CSS-Regel greift. !important wäre unnötig, ist aber gegen exotische
     Browser-Defaults auf SVG-Wurzelelementen defensiv. */
  .label svg { width: 100% !important; height: 100% !important; display: block; }

  /* Layout: zentrierter QR + Token + MP-Name (Schnitt-Bogen) */
  .label .qr-center {
    width: 38mm;
    height: 38mm;
  }
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
    <button type="button" data-action="print">Drucken</button>
    <button type="button" class="secondary" data-action="close">Schließen</button>
  </div>
</body>
</html>`;
}

/**
 * HTML für das initial leere Fenster — wird sofort beim Click geschrieben,
 * um die User-Activation für ``window.open`` nicht zu verbrauchen, während
 * die SVGs asynchron geladen werden. Sobald die SVGs da sind, ersetzt der
 * finale Body diesen Platzhalter.
 */
function buildLoadingHtml(count: number): string {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8" /><title>QR-Codes werden vorbereitet …</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
         color: #555; padding: 2.5rem; line-height: 1.5; }
  .spinner { display: inline-block; width: 14px; height: 14px;
             border: 2px solid #ccc; border-top-color: #1463ff;
             border-radius: 50%; animation: sp 0.8s linear infinite;
             vertical-align: -2px; margin-right: 8px; }
  @keyframes sp { to { transform: rotate(360deg); } }
</style></head>
<body><span class="spinner"></span>${count} QR-Code${count === 1 ? '' : 's'} werden vorbereitet …</body>
</html>`;
}

function buildErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8" /><title>Fehler beim Laden</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
         color: #b91c1c; padding: 2.5rem; line-height: 1.5; }
</style></head>
<body><strong>QR-Codes konnten nicht vorbereitet werden:</strong><br />${escapeHtml(message)}</body>
</html>`;
}

/**
 * Öffnet ein neues Fenster mit dem Bulk-Druck-Layout für die übergebenen
 * Tokens. Liefert ``true``, wenn das Pop-up geöffnet werden konnte (das ist
 * die einzige synchrone Erfolgs-Indikation, die wir geben können — der
 * eigentliche Druck-Workflow läuft danach asynchron im Pop-up).
 *
 * Wichtig:
 *
 * - ``window.open`` ohne ``noopener`` aufrufen, sonst gibt der Browser
 *   ``null`` zurück und ``document.write`` läuft nicht. Same-origin,
 *   Inhalt komplett kontrolliert — kein Sicherheitsproblem.
 * - ``window.open`` MUSS synchron beim Click aufgerufen werden, sonst
 *   greift der Pop-up-Blocker (besonders Firefox). Daher öffnen wir das
 *   Fenster zuerst mit einem Lade-Platzhalter und holen die SVGs erst
 *   danach asynchron — die User-Activation ist nach einem ``await`` weg.
 */
export function openTokensPrintWindow(tokens: QrTokenRead[], layout: LabelLayout): boolean {
  if (tokens.length === 0) return false;
  const w = window.open('', '_blank', 'width=900,height=900');
  if (!w) return false;

  // Sofort einen Lade-Platzhalter rendern, damit der User nicht in ein
  // weißes Fenster starrt, während wir die SVGs holen.
  w.document.open();
  w.document.write(buildLoadingHtml(tokens.length));
  w.document.close();

  // Async-Pipeline: SVGs holen → finales HTML rendern → Click-Handler vom
  // Opener aus an die Buttons hängen → Auto-Print. Klick-Handler werden
  // bewusst NICHT als Inline-Script ausgeliefert, weil das about:blank-
  // Fenster in Firefox die script-src 'self'-CSP nicht gegen die App-
  // Origin matcht. Programmatische ``addEventListener`` aus dem Opener
  // sind davon nicht betroffen — same-origin-Inheritance reicht hier.
  void (async () => {
    try {
      // Parallelitaet bewusst begrenzen — bei einem voll besetzten
      // Avery-Bogen (189 Etiketten) hat ``Promise.all`` ueber alle
      // Tokens den Backend-Threadpool/DB-Pool sporadisch in den 500
      // gefahren.
      const tokensWithSvg = await fetchSvgsWithConcurrency(tokens);
      const html = buildPrintHtml(tokensWithSvg, layout);
      w.document.open();
      w.document.write(html);
      w.document.close();

      const printBtn = w.document.querySelector<HTMLButtonElement>('[data-action="print"]');
      const closeBtn = w.document.querySelector<HTMLButtonElement>('[data-action="close"]');
      printBtn?.addEventListener('click', () => {
        try {
          w.focus();
        } catch {
          /* noop — focus() kann an Pop-up-Restrictions scheitern */
        }
        w.print();
      });
      closeBtn?.addEventListener('click', () => w.close());

      // Auto-Print mit kurzer Verzögerung, damit Layout/Fonts gerendert sind.
      // 600 ms hat sich in der ursprünglichen Implementierung bewährt.
      window.setTimeout(() => {
        try {
          w.focus();
        } catch {
          /* noop */
        }
        w.print();
      }, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      w.document.open();
      w.document.write(buildErrorHtml(msg));
      w.document.close();
    }
  })();

  return true;
}
