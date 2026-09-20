/**
 * Formatiert einen Wert als CSV-Feld fuer deutsches Excel/Calc.
 *
 * Zwei Schutzschichten:
 * - **Formel-Injection (CWE-1236):** Werte, die mit `=`, `+`, `-`, `@`, TAB
 *   oder CR beginnen, bekommen einen fuehrenden Apostroph, damit Tabellen-
 *   programme sie nicht als Formel ausfuehren. TAB und CR zaehlen mit, weil
 *   Excel sie beim Parsen entfernt und das danach folgende `=` dann doch
 *   wieder als Formel wertet.
 * - **Delimiter/Quoting:** Felder mit `;`, `"` oder Zeilenumbruch werden
 *   in doppelte Anfuehrungszeichen gesetzt (enthaltene `"` verdoppelt).
 *
 * Gemeinsame Quelle fuer alle Frontend-CSV-Exporte (Dashboard, Erfassungen,
 * Auswertungen) — verhindert, dass eine Kopie den Schutz verliert.
 */
export function csvField(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[;"\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
