import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { LargeTitle, Section, cx } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

import { RelatedMeasuringPoints, type MasterDataResource } from './RelatedMeasuringPoints';

export interface DetailRow {
  label: string;
  value: string | null;
}

/** Baut „Straße, PLZ Ort" aus den (optionalen) Adressfeldern; `null`, wenn leer. */
export function formatAddress(a: {
  address_street: string | null;
  address_postcode: string | null;
  address_city: string | null;
}): string | null {
  const cityLine = [a.address_postcode, a.address_city].filter(Boolean).join(' ').trim();
  const parts = [a.address_street, cityLine].filter((p) => p && p.trim() !== '');
  return parts.length > 0 ? parts.join(', ') : null;
}

interface MasterDataDetailPageProps<T> {
  resource: MasterDataResource;
  id: number;
  backTo: string;
  backLabel: string;
  fallbackTitle: string;
  getTitle: (entity: T) => string;
  getRows: (entity: T) => DetailRow[];
  /** Optionaler Zusatzinhalt, gerendert nach den Stammdaten und vor den Messstellen. */
  afterRows?: (entity: T) => ReactNode;
}

/**
 * Generische Stammdaten-Detailseite: Back-Link + Titel + read-only
 * Stammdaten-Card + die zugeordneten Messstellen. Eigentümer-, Lieferanten-
 * und Mieter-Seite unterscheiden sich nur in den angezeigten Feldern und der
 * Ressource — die teilt sich diese Komponente.
 */
export function MasterDataDetailPage<T>({
  resource,
  id,
  backTo,
  backLabel,
  fallbackTitle,
  getTitle,
  getRows,
  afterRows,
}: MasterDataDetailPageProps<T>) {
  const [entity, setEntity] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validId = Number.isFinite(id);

  useEffect(() => {
    if (!validId) {
      setError('Ungültige Adresse.');
      return;
    }
    let active = true;
    setEntity(null);
    setError(null);
    api
      .get<T>(`/${resource}/${id}`)
      .then((data) => {
        if (active) setEntity(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Datensatz konnte nicht geladen werden.');
      });
    return () => {
      active = false;
    };
  }, [resource, id, validId]);

  const rows = entity ? getRows(entity).filter((r) => r.value && r.value.trim() !== '') : [];

  return (
    <>
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-caption font-semibold text-primary-deep transition-colors hover:text-primary"
      >
        <ArrowLeft size={14} />
        {backLabel}
      </Link>
      <LargeTitle title={entity ? getTitle(entity) : fallbackTitle} />

      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <Section header="Stammdaten">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={cx(
                'flex justify-between gap-4 px-5 py-3',
                index > 0 && 'border-hairline border-t border-border',
              )}
            >
              <span className="text-caption text-tertiary">{row.label}</span>
              <span className="text-right text-body text-label">{row.value}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {entity && afterRows ? afterRows(entity) : null}

      {validId ? <RelatedMeasuringPoints resource={resource} id={id} /> : null}
    </>
  );
}
