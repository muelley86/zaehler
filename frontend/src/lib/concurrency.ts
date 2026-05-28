/**
 * Helper für parallelen Aufruf einer Async-Funktion mit Concurrency-Limit.
 *
 * Wird benutzt, wenn das Frontend mehrere voneinander unabhaengige
 * API-Calls absetzen muss (z. B. ``GET /measuring-points/{id}/state``
 * je MP, oder ``GET /qr-tokens/{token}/qr`` beim Bulk-Druck). Ein
 * ungebremstes ``Promise.all`` schiebt sonst alle Requests gleichzeitig
 * an den Backend-Server und saugt dort SQLAlchemy-Pool sowie uvicorn-
 * Threadpool leer — der naechste User-Klick haengt 2-3 Minuten bis
 * der Pool wieder frei ist.
 *
 * Pattern: ``maxConcurrency`` Worker laufen parallel und ziehen Items
 * aus einem geteilten Index, bis nichts mehr da ist. Result wird in
 * derselben Reihenfolge wie ``items`` zurueckgegeben.
 */

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  const result: (R | undefined)[] = new Array<R | undefined>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const item = items[i];
      if (item === undefined) continue;
      result[i] = await fn(item, i);
    }
  }

  const workerCount = Math.max(1, Math.min(maxConcurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return result as R[];
}
