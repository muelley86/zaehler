/**
 * QR-Code-Karte auf der Messstellen-Detailseite.
 *
 * Zeigt eine kleine PNG-Vorschau (für Sichtprüfung) und drei Aktionen:
 * Drucken (öffnet ein A6-Druckfenster), PNG/SVG herunterladen.
 *
 * Der Endpoint ``/measuring-points/{id}/qr`` ist admin-only — dieselbe
 * Berechtigungsschiene wie die Detailseite, daher kein zusätzlicher Guard
 * hier nötig.
 */

import { useState } from 'react';
import { Download, Printer, QrCode } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import type { MeasuringPointRead } from '@/lib/types';

import { openQrPrintWindow } from './QrPrintSheet';

interface QrCodeCardProps {
  mp: MeasuringPointRead;
}

export function QrCodeCard({ mp }: QrCodeCardProps) {
  const [printError, setPrintError] = useState<string | null>(null);
  const previewUrl = `/api/v1/measuring-points/${mp.id}/qr?format=png&size=small`;
  const downloadPng = `/api/v1/measuring-points/${mp.id}/qr?format=png&size=large`;
  const downloadSvg = `/api/v1/measuring-points/${mp.id}/qr?format=svg&size=large`;

  function handlePrint() {
    setPrintError(null);
    const ok = openQrPrintWindow(mp);
    if (!ok) {
      setPrintError(
        'Druck-Fenster wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.',
      );
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-caption-bold uppercase text-tertiary">QR-Code</div>
          <div className="mt-1 text-body text-secondary">
            Aufkleben am Zähler, dann mit dem Smartphone scannen — der Erfasser landet direkt in
            der passenden Maske.
          </div>
        </div>
        <div className="rounded-card border-hairline border-border bg-white p-2 shadow-glass">
          <img
            src={previewUrl}
            alt={`QR-Code ${mp.name}`}
            className="block h-24 w-24"
            loading="lazy"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="filled"
          size="sm"
          leftIcon={<Printer size={14} />}
          onClick={handlePrint}
        >
          Drucken
        </Button>
        <a
          href={downloadPng}
          download={`qr-mp-${mp.id}.png`}
          className="inline-flex h-8 items-center gap-2 rounded-pill border-hairline border-border bg-fill px-3 text-caption font-semibold text-label transition-colors hover:bg-fill-strong"
        >
          <Download size={14} />
          PNG
        </a>
        <a
          href={downloadSvg}
          download={`qr-mp-${mp.id}.svg`}
          className="inline-flex h-8 items-center gap-2 rounded-pill border-hairline border-border bg-fill px-3 text-caption font-semibold text-label transition-colors hover:bg-fill-strong"
        >
          <Download size={14} />
          SVG
        </a>
        <span className="ml-auto inline-flex items-center gap-1.5 text-caption text-tertiary">
          <QrCode size={14} />
          MP-{mp.id}
        </span>
      </div>

      {printError ? (
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-card border-hairline p-3 text-caption text-danger">
          {printError}
        </div>
      ) : null}
    </Card>
  );
}
