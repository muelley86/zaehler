/**
 * Druck-Workflow für Messstellen-QR-Codes.
 *
 * Öffnet ein neues Fenster, schreibt eine A6-Druckseite mit dem SVG-QR-Code
 * (skaliert verlustfrei) und zentralen Stammdaten der Messstelle und löst
 * dann ``window.print()`` aus. Die Verzögerung wartet auf das geladene
 * Bild — sonst druckt Chrome auf Mobilgeräten gelegentlich eine leere Seite.
 *
 * Pattern angelehnt an :file:`features/auth/TwoFactorSection.tsx`.
 */

import type { MeasuringPointRead } from '@/lib/types';
import { describeMeterType } from '@/lib/meterLabels';

const PRINT_TIMEOUT_MS = 400;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintHtml(mp: MeasuringPointRead): string {
  const activeMeter = mp.physical_meters.find((m) => m.removed_at === null);
  const typeText = describeMeterType(mp.type, mp.heating_source);
  const today = new Date().toLocaleDateString('de-DE');
  const qrUrl = `/api/v1/measuring-points/${mp.id}/qr?format=svg&size=large`;
  const docTitle = `QR-Code · ${mp.name}`;

  const rows: Array<{ k: string; v: string }> = [{ k: 'Typ', v: typeText }];
  if (mp.location_name) rows.push({ k: 'Standort', v: mp.location_name });
  if (activeMeter) rows.push({ k: 'Seriennummer', v: activeMeter.serial_number });

  const rowsHtml = rows
    .map(
      (r) =>
        `<div class="row"><span class="row-key">${escapeHtml(r.k)}</span><span class="row-value">${escapeHtml(r.v)}</span></div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: A6; margin: 5mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
    color: #111;
    background: #fff;
  }
  .sheet {
    width: 96mm;
    min-height: 138mm;
    padding: 4mm 4mm 6mm;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .qr {
    width: 70mm;
    height: 70mm;
    margin-top: 2mm;
  }
  .qr img { width: 100%; height: 100%; display: block; }
  .name {
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.15;
    margin-top: 4mm;
  }
  .meta {
    width: 100%;
    margin-top: 3mm;
    font-size: 9pt;
    line-height: 1.35;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 2mm;
    border-top: 0.3mm solid #d0d0d0;
    padding: 1mm 0;
  }
  .row:last-child { border-bottom: 0.3mm solid #d0d0d0; }
  .row-key { color: #666; }
  .row-value { font-weight: 600; }
  .hint {
    margin-top: 5mm;
    font-size: 9pt;
    color: #555;
  }
  .footer {
    margin-top: auto;
    padding-top: 4mm;
    font-size: 7.5pt;
    color: #999;
    letter-spacing: 0.02em;
  }
  @media print {
    .no-print { display: none !important; }
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
</style>
</head>
<body>
  <div class="sheet">
    <div class="qr"><img id="qr-img" src="${qrUrl}" alt="QR-Code ${escapeHtml(mp.name)}" /></div>
    <div class="name">${escapeHtml(mp.name)}</div>
    <div class="meta">${rowsHtml}</div>
    <div class="hint">Mit der Smartphone-Kamera scannen, um Werte zu erfassen.</div>
    <div class="footer">MP-${mp.id} · erzeugt ${today}</div>
  </div>
  <div class="controls no-print">
    <button onclick="window.print()">Drucken</button>
    <button class="secondary" onclick="window.close()">Schließen</button>
  </div>
  <script>
    (function () {
      var img = document.getElementById('qr-img');
      function go() { setTimeout(function () { window.focus(); window.print(); }, ${PRINT_TIMEOUT_MS}); }
      if (img && img.complete) { go(); }
      else if (img) { img.addEventListener('load', go); img.addEventListener('error', go); }
      else { go(); }
    })();
  </script>
</body>
</html>`;
}

/**
 * Öffnet ein neues Fenster mit einem druckfertigen A6-Layout der Messstelle.
 * Gibt ``true`` zurück, wenn das Fenster geöffnet werden konnte — andernfalls
 * blockiert vermutlich der Popup-Blocker.
 */
export function openQrPrintWindow(mp: MeasuringPointRead): boolean {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
  if (!w) return false;
  w.document.open();
  w.document.write(buildPrintHtml(mp));
  w.document.close();
  return true;
}
