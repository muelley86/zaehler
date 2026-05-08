/**
 * TokenAssignSheet — wird nach dem Scan eines unzugeordneten QR-Codes von
 * einem berechtigten User (Admin oder Recorder mit ``can_assign_qr_tokens``)
 * geöffnet, um den Token einer Messstelle zuzuordnen.
 *
 * Die MP-Auswahl ist auf jene MPs beschränkt, die dem User in seiner
 * Erfassungsmaske ohnehin zur Verfügung stehen — wir nutzen die schon vom
 * Caller geladene ``points``-Liste, damit wir keinen separaten Fetch
 * brauchen.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Select, Sheet } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead } from '@/lib/types';

interface TokenAssignSheetProps {
  token: string;
  /** Liste der MPs, auf die der User Zugriff hat. Aus dem Parent durchgereicht,
   *  damit wir keinen zusätzlichen Fetch brauchen. */
  measuringPoints: MeasuringPointRead[];
  onAssigned: (measuringPointId: number) => void;
  onClose: () => void;
}

export function TokenAssignSheet({
  token,
  measuringPoints,
  onAssigned,
  onClose,
}: TokenAssignSheetProps) {
  const [mpId, setMpId] = useState<number | null>(measuringPoints[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mpId === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/qr-tokens/${token}/assign`, { measuring_point_id: mpId });
      onAssigned(mpId);
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Zuordnung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  if (measuringPoints.length === 0) {
    return (
      <Sheet open onClose={onClose} title="QR-Code zuordnen">
        <div className="space-y-4">
          <div className="text-body-sm text-secondary">
            Du hast aktuell keine Messstellen zugeordnet, denen du diesen QR-Code zuweisen könntest.
            Bitte den Admin um die Zuordnung.
          </div>
          <Button type="button" variant="filled" fullWidth onClick={onClose}>
            Schließen
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="QR-Code zuordnen">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="text-body-sm text-secondary">
          Token <code className="num text-label">{token}</code> ist noch keiner Messstelle
          zugeordnet. Welche Messstelle ist das?
        </div>
        <Select
          label="Messstelle"
          value={mpId ?? ''}
          onChange={(e) => setMpId(Number(e.target.value))}
        >
          {measuringPoints.map((mp) => (
            <option key={mp.id} value={mp.id}>
              {mp.name}
            </option>
          ))}
        </Select>
        {error ? (
          <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
            {error}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="bordered" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" variant="filled" fullWidth disabled={busy || mpId === null}>
            {busy ? 'Speichere…' : 'Zuordnen'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
