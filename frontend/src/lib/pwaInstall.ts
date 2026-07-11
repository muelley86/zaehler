/**
 * Erkennung von iOS + PWA-Installationsstatus für den Install-Hinweis.
 *
 * Hintergrund: iOS darf Web-Storage (IndexedDB/localStorage) NICHT
 * installierter Web-Apps nach 7 Tagen Safari-Inaktivität löschen — für die
 * Offline-Warteschlange ist die Installation also Datensicherheit, kein
 * Komfort. Android/Chrome kennt diese Eviction in der Form nicht.
 */

export function isIos(): boolean {
  const nav = window.navigator;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPadOS ≥ 13 meldet sich mit Desktop-Safari-UA als Mac; die Touch-Punkte
  // verraten das Tablet.
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // navigator.standalone ist iOS-proprietär und fehlt im DOM-Typ.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function shouldShowIosInstallHint(): boolean {
  return isIos() && !isStandalone();
}
