/**
 * QrCodeCard — zeigt die zugeordneten QR-Tokens einer Messstelle.
 *
 * Vor Feature A war hier ein direkter QR-Code-Generator pro MP — das ist
 * abgelöst durch das Token-Verheiratungs-Modell. Jetzt listet die Card die
 * Tokens, die dieser MP zugeordnet sind, mit Vorschau und Lösen-Button.
 *
 * Wenn noch kein Token zugeordnet ist, leitet ein Hinweis-CTA in die
 * /qr-codes-Verwaltung. Dort werden Tokens auf Vorrat angelegt und
 * gedruckt; die Zuordnung passiert dann beim Scan vor Ort.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Printer, QrCode, Unlink } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead, QrTokenRead } from '@/lib/types';

interface QrCodeCardProps {
  mp: MeasuringPointRead;
}

export function QrCodeCard({ mp }: QrCodeCardProps) {
  const [tokens, setTokens] = useState<QrTokenRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<QrTokenRead[]>(`/qr-tokens?measuring_point_id=${mp.id}`)
      .then((rows) => {
        if (!cancelled) setTokens(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte QR-Codes nicht laden.');
      });
    return () => {
      cancelled = true;
    };
  }, [mp.id, tick]);

  async function unassign(token: string) {
    if (!window.confirm(`Zuordnung von ${token} zu „${mp.name}" lösen?`)) return;
    try {
      await api.delete(`/qr-tokens/${token}/assign`);
      setTick((t) => t + 1);
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    }
  }

  function printSingle(token: string) {
    const w = window.open(
      `/api/v1/qr-tokens/${token}/qr?format=svg&size=large`,
      '_blank',
    );
    if (w) w.focus();
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-caption-bold uppercase text-tertiary">QR-Codes</div>
        <Link
          to="/qr-codes"
          className="inline-flex items-center gap-1 text-caption font-semibold text-primary-deep hover:underline"
        >
          Verwaltung
          <ExternalLink size={12} />
        </Link>
      </div>

      {error ? (
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : tokens === null ? (
        <div className="mt-3 text-body-sm text-tertiary">Lade…</div>
      ) : tokens.length === 0 ? (
        <div className="mt-3 space-y-2 text-body-sm">
          <div className="text-secondary">
            Dieser Messstelle ist noch kein QR-Code zugeordnet.
          </div>
          <div className="text-caption text-tertiary">
            Tokens werden in der QR-Code-Verwaltung auf Vorrat angelegt und beim Scannen vor Ort
            zugeordnet — oder direkt dort über „Drucken“ ausgedruckt und verklebt.
          </div>
          <Link
            to="/qr-codes"
            className="inline-flex h-8 items-center gap-2 rounded-pill bg-gradient-primary px-3 text-caption font-semibold text-white shadow-glow-primary transition-[filter] hover:brightness-105"
          >
            <QrCode size={14} />
            Zur QR-Code-Verwaltung
          </Link>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-card border-hairline border-border bg-fill p-2.5"
            >
              <div className="rounded-card border-hairline border-border bg-white p-1.5 shadow-glass">
                <img
                  src={`/api/v1/qr-tokens/${t.token}/qr?format=png&size=small`}
                  alt={`QR ${t.token}`}
                  className="block h-12 w-12"
                  loading="lazy"
                />
              </div>
              <div className="num min-w-0 flex-1 text-body font-semibold text-label">
                {t.token}
              </div>
              <Button
                type="button"
                variant="plain"
                size="sm"
                leftIcon={<Printer size={14} />}
                onClick={() => printSingle(t.token)}
                title="Drucken / SVG anzeigen"
              >
                <span className="sr-only">Drucken</span>
              </Button>
              <Button
                type="button"
                variant="plain"
                size="sm"
                leftIcon={<Unlink size={14} />}
                onClick={() => void unassign(t.token)}
                title="Zuordnung lösen"
              >
                <span className="sr-only">Lösen</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
