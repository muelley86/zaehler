/**
 * Pure Helper: extrahiert die Messstellen-ID aus dem dekodierten QR-Inhalt.
 *
 * Akzeptiert:
 * - vollständige URLs (``https://host/erfassen?mp=42``)
 * - Pfade (``/erfassen?mp=42``)
 *
 * Liefert ``null``, wenn der Inhalt keine gültige MP-ID enthält. Das ruft
 * den Aufrufer (QrScanSheet) dazu auf, dem User eine "ungültiger Code"-
 * Meldung zu zeigen, statt blind eine Navigation auszulösen.
 *
 * Sicherheits-Invariante: Wir verwenden nur ``mp`` aus der Query und liefern
 * nie einen Cross-Origin-Hostname zurück — der Aufrufer navigiert immer auf
 * dieselbe App-Origin.
 */

export interface ScannedMeasuringPoint {
  mp: number;
}

export function parseScannedUrl(decoded: string): ScannedMeasuringPoint | null {
  const text = decoded.trim();
  if (text === '') return null;

  let pathname: string;
  let search: string;
  try {
    // Absolut: zweiter Parameter wird ignoriert. Relativ: brauchen wir
    // eine Base-URL, damit ``new URL`` nicht wirft.
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
      ? new URL(text)
      : new URL(text, 'https://placeholder.invalid');
    pathname = url.pathname;
    search = url.search;
  } catch {
    return null;
  }

  // Nur exakter Pfad ``/erfassen`` (Trailing-Slash ist erlaubt). Defensiv
  // gegen freaky decoded Inhalte wie ``/erfassen2`` oder ``/admin/erfassen``.
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized !== '/erfassen') return null;

  const params = new URLSearchParams(search);
  const raw = params.get('mp');
  if (raw === null) return null;

  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0 || String(id) !== raw.trim()) return null;
  return { mp: id };
}
