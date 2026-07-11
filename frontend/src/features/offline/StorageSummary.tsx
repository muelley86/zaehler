/**
 * Speicher-Status der Offline-Daten: Belegung via storage.estimate() und
 * Persistenz-Zusage via storage.persisted() (persist() fordert der
 * OnlineStatusProvider beim Start an — hier wird das Ergebnis sichtbar).
 * Ohne Storage-API (ältere Browser, HTTP-Kontext) erscheint nichts.
 */

import { useEffect, useState } from 'react';

const STORAGE_WARN_RATIO = 0.8;
const BYTES_PER_MB = 1024 * 1024;

interface StorageInfo {
  usageMb: number;
  quotaMb: number;
  ratio: number;
  persisted: boolean | null;
}

export function StorageSummary() {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (!estimate || cancelled) return;
        const usage = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;
        const persisted = (await navigator.storage.persisted?.()) ?? null;
        if (cancelled) return;
        setInfo({
          usageMb: Math.round(usage / BYTES_PER_MB),
          quotaMb: Math.round(quota / BYTES_PER_MB),
          ratio: quota > 0 ? usage / quota : 0,
          persisted,
        });
      } catch {
        /* Storage-API launisch (z. B. private Tabs) — dann keine Anzeige. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (info === null) return null;

  return (
    <div className="px-1 pb-3">
      <div data-testid="storage-summary" className="text-caption text-tertiary">
        Offline-Speicher: {info.usageMb} MB von {info.quotaMb} MB belegt
        {info.persisted === null
          ? ''
          : info.persisted
            ? ' · dauerhaft gesichert'
            : ' · nicht dauerhaft gesichert'}
      </div>
      {info.ratio >= STORAGE_WARN_RATIO ? (
        <div
          data-testid="storage-warning"
          className="mt-2 rounded-card border-hairline border-warning/40 bg-warning/10 p-3 text-caption text-secondary"
        >
          Der Offline-Speicher ist fast voll — bitte synchronisieren, sonst können neue Fotos nicht
          mehr gesichert werden.
        </div>
      ) : null}
    </div>
  );
}
