/**
 * Bulk-Druck für eine Auswahl an QR-Tokens.
 *
 * Layout: A4 hochkant, 2 Spalten × 4 Zeilen = 8 Etiketten pro Seite. Jedes
 * Feld ist 95×65 mm und enthält den großen QR-Code (SVG, verlustfrei
 * skaliert), den Token-Klartext sowie — falls zugeordnet — den
 * Messstellen-Namen.
 *
 * Pattern analog zu :file:`features/measuring-points/QrPrintSheet.tsx`:
 * neues Fenster, HTML schreiben, ``window.print()`` triggern. Der Browser
 * macht den Rest.
 */

import type { QrTokenRead } from '@/lib/types';

const PRINT_TIMEOUT_MS = 600;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintHtml(tokens: QrTokenRead[]): string {
  const cells = tokens
    .map((t) => {
      const qrUrl = `/api/v1/qr-tokens/${t.token}/qr?format=svg&size=large`;
      const subline = t.measuring_point_name
        ? escapeHtml(t.measuring_point_name)
        : 'Bereit zur Zuordnung';
      return `
        <div class="cell">
          <div class="qr"><img src="${qrUrl}" alt="QR ${escapeHtml(t.token)}" /></div>
          <div class="token">${escapeHtml(t.token)}</div>
          <div class="sub">${subline}</div>
        </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>QR-Codes (${tokens.length})</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
    color: #111;
    background: #fff;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 65mm;
    gap: 2mm;
  }
  .cell {
    border: 0.3mm dashed #999;
    padding: 4mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    page-break-inside: avoid;
  }
  .qr {
    width: 38mm;
    height: 38mm;
  }
  .qr img { width: 100%; height: 100%; display: block; }
  .token {
    margin-top: 2mm;
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .sub {
    margin-top: 1mm;
    font-size: 9pt;
    color: #555;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
  @media print {
    .controls { display: none !important; }
  }
</style>
</head>
<body>
  <div class="grid">${cells}</div>
  <div class="controls">
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
 */
export function openTokensPrintWindow(tokens: QrTokenRead[]): boolean {
  if (tokens.length === 0) return false;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=900');
  if (!w) return false;
  w.document.open();
  w.document.write(buildPrintHtml(tokens));
  w.document.close();
  return true;
}
