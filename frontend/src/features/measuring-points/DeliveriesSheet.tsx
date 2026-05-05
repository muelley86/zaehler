import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';

import { Button, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe, formatDe, nowForInput, parseDe } from '@/lib/format';
import type { DeliveryRead, RegisterRead } from '@/lib/types';

export function DeliveriesSheet({
  open,
  onClose,
  register,
}: {
  open: boolean;
  onClose: () => void;
  register: RegisterRead;
}) {
  const [items, setItems] = useState<DeliveryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const [deliveryAt, setDeliveryAt] = useState(nowForInput());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    api
      .get<DeliveryRead[]>(`/registers/${register.id}/deliveries`)
      .then(setItems)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [open, register.id, tick]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const numeric = parseDe(amount);
      await api.post(`/registers/${register.id}/deliveries`, {
        delivery_at: deliveryAt,
        amount: numeric,
        note: note || null,
      });
      setAmount('');
      setNote('');
      setDeliveryAt(nowForInput());
      setTick((t) => t + 1);
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Konnte Lieferung nicht erfassen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm('Lieferung wirklich löschen?')) return;
    try {
      await api.delete(`/deliveries/${id}`);
      setTick((t) => t + 1);
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    }
  }

  const totalRefilled = items.reduce((acc, d) => acc + Number(d.amount), 0);

  return (
    <Sheet open={open} onClose={onClose} title={`Befüllungen · ${register.label}`}>
      <div className="space-y-5">
        <form onSubmit={(e) => void add(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Zeitpunkt"
              type="datetime-local"
              value={deliveryAt}
              onChange={(e) => setDeliveryAt(e.target.value)}
              required
            />
            <TextField
              label={`Menge (${register.unit})`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              numeric
            />
          </div>
          <TextField
            label="Notiz (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={error}
          />
          <Button type="submit" variant="filled" disabled={busy} fullWidth>
            {busy ? 'Speichere…' : 'Lieferung erfassen'}
          </Button>
        </form>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-caption-bold uppercase text-tertiary">Bisherige Lieferungen</div>
            {items.length > 0 ? (
              <div className="num text-caption text-tertiary">
                Σ {formatDe(totalRefilled)} {register.unit}
              </div>
            ) : null}
          </div>
          {items.length === 0 ? (
            <div className="rounded-card border-hairline border-border bg-fill p-4 text-center text-caption text-tertiary">
              Noch keine Lieferungen erfasst.
            </div>
          ) : (
            <ul className="bg-fill/60 divide-y divide-separator overflow-hidden rounded-card border-hairline border-border">
              {items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="num text-body text-label">
                      {formatDateTimeDe(d.delivery_at)}
                    </div>
                    {d.note ? <div className="text-caption text-tertiary">{d.note}</div> : null}
                    <div className="text-caption text-tertiary">
                      {d.created_by_username ?? '—'} ·{' '}
                      <span className="num">{d.created_at.replace('T', ' ').slice(0, 16)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-headline text-primary">+ {formatDe(d.amount)}</div>
                    <div className="text-caption text-tertiary">{register.unit}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(d.id)}
                    aria-label="Löschen"
                    className="hover:bg-danger/10 flex h-8 w-8 items-center justify-center rounded-full text-danger transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
