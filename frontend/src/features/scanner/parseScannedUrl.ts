/**
 * Pure Helper: extrahiert MP-ID oder Token aus dem dekodierten QR-Inhalt.
 *
 * Akzeptierte Formate:
 * - ``…/q/K7MP3X9F`` (neu, kompakter Shortpath — wird ab 2.x für neu
 *   generierte Etiketten verwendet, spart 13 Zeichen QR-Inhalt)
 * - ``…/erfassen?token=K7MP3X9F`` (vorheriges Token-Format — bestehende
 *   geklebte Etiketten funktionieren weiter)
 * - ``…/erfassen?mp=42`` (Legacy Direkt-URL — kommt nur noch von ganz
 *   alten Etiketten vor; wir generieren das nicht mehr)
 *
 * Sowohl absolute URLs als auch reine Pfade sind erlaubt.
 *
 * Liefert ``null``, wenn der Inhalt nicht passt — der Aufrufer
 * (:file:`QrScanSheet.tsx`) zeigt dann implizit "weiter scannen", bis ein
 * gültiger Code im Sucher landet.
 *
 * Sicherheits-Invariante: Wir verwenden ausschließlich ``mp`` bzw. ``token``
 * aus der Query und liefern nie einen Cross-Origin-Hostname zurück — der
 * Aufrufer navigiert immer auf dieselbe App-Origin.
 */

export type ScannedQr = { kind: 'mp'; mp: number } | { kind: 'token'; token: string };

// Crockford-Base32-Alphabet (8 Zeichen). Wir akzeptieren beim Scan auch
// Kleinbuchstaben für Robustheit (manche Scanner normalisieren), normalisieren
// aber später zu Großschreibung.
const TOKEN_RE = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{8}$/;
// Path-Match für /q/<TOKEN> mit optionalem Trailing-Slash.
const Q_PATH_RE = /^\/q\/([0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{8})\/?$/;

export function parseScannedUrl(decoded: string): ScannedQr | null {
  const text = decoded.trim();
  if (text === '') return null;

  let pathname: string;
  let search: string;
  try {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
      ? new URL(text)
      : new URL(text, 'https://placeholder.invalid');
    pathname = url.pathname;
    search = url.search;
  } catch {
    return null;
  }

  // Neuer Shortpath: /q/<TOKEN> — gewinnt vor allem anderen, weil das
  // unser primäres Ausgabeformat ist.
  const qMatch = Q_PATH_RE.exec(pathname);
  const qToken = qMatch?.[1];
  if (qToken) {
    return { kind: 'token', token: qToken.toUpperCase() };
  }

  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized !== '/erfassen') return null;

  const params = new URLSearchParams(search);

  // Token hat Vorrang vor MP — wenn beide vorhanden sind, gewinnt der Token
  // (das ist der neue Pfad, MP ist Legacy).
  const tokenRaw = params.get('token');
  if (tokenRaw !== null) {
    const trimmed = tokenRaw.trim();
    if (!TOKEN_RE.test(trimmed)) return null;
    return { kind: 'token', token: trimmed.toUpperCase() };
  }

  const mpRaw = params.get('mp');
  if (mpRaw !== null) {
    const id = Number.parseInt(mpRaw, 10);
    if (!Number.isFinite(id) || id <= 0 || String(id) !== mpRaw.trim()) return null;
    return { kind: 'mp', mp: id };
  }

  return null;
}
