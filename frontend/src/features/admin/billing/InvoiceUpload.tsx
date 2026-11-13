/**
 * Import einer Monatsrechnung (PDF): Dateiauswahl, Größenprüfung, Upload. Die Karte „Rechnungen“
 * und der Abrechnungsassistent benutzen denselben Baustein.
 */
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import type { BillingInvoiceRead } from '@/lib/types';

import { errorText } from './circleForm';

const MAX_BYTES = 10 * 1024 * 1024;

export function InvoiceUpload({
  circleId,
  onImported,
  label = 'Monatsrechnung (PDF) importieren',
}: {
  circleId: number;
  onImported: (invoice: BillingInvoiceRead) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('Die Datei ist zu groß (max. 10 MB).');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      onImported(
        await api.upload<BillingInvoiceRead>(`/billing-circles/${circleId}/invoices`, fd, 'POST'),
      );
    } catch (err) {
      setError(errorText(err, 'Import fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="mb-1.5 text-caption-bold text-tertiary uppercase">{label}</div>
      {/* Das rohe Dateifeld des Browsers ist als Upload kaum zu erkennen — der Button öffnet es.
          Der Ort bestimmt den Namen des Felds (im Assistenten steht dort der Monat). */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => void selectFile(e)}
        disabled={busy}
        aria-label={label}
        className="hidden"
      />
      <Button
        variant="filled"
        leftIcon={<Upload size={16} />}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        PDF hochladen
      </Button>
      {busy ? <div className="text-caption text-tertiary">Rechnung wird gelesen…</div> : null}
      {error ? <div className="text-caption text-danger">{error}</div> : null}
    </div>
  );
}
