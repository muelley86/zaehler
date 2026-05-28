/**
 * Globale Suche im Sheet. Tippt der User Zaehlernummer, MP-Name, Standort-
 * Name oder eine Standort-Notiz, ruft das Sheet ``GET /api/v1/search?q=…``
 * mit Debounce + AbortController auf und zeigt die Treffer als klickbare
 * Liste. Navigation:
 * - Admin: ``/admin/messstellen/{id}`` (Detail-Seite).
 * - Recorder: ``/erfassen?mp={id}`` (Erfassungsmaske mit MP-Vorauswahl).
 *
 * Das Sheet erscheint Full-Width auf Mobile und als zentriertes Modal auf
 * Desktop — dafuer reicht die bestehende ``<Sheet>``-Komponente (Portal +
 * max-h-80vh).
 */

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Sheet } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';
import type { SearchHit, SearchMatchKind } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

const MATCH_LABEL: Record<SearchMatchKind, string> = {
  serial: 'Zähler-Nr.',
  contract_number: 'Vertragsnr.',
  market_location: 'Marktlokation',
  name: 'Name',
  main_location: 'Hauptstandort',
  location: 'Zählerstandort',
  main_location_note: 'Notiz Hauptstandort',
  location_note: 'Notiz Zählerstandort',
};

export function GlobalSearchSheet({ open, onClose }: Props) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Beim Oeffnen: State zuruecksetzen + Autofocus. Beim Schliessen: Query
  // weglassen — beim naechsten Aufruf ist das Feld leer, das ist klarer
  // als ein „letzter Suchbegriff", weil der Use-Case meist eine andere
  // Rechnung ist.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError(null);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  // Debounced Backend-Call. Ein InFlight-Request wird abgebrochen, wenn
  // der User weitertippt — sonst koennte eine veraltete Antwort die
  // aktuelle ueberschreiben.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setLoading(true);
      api
        .get<SearchHit[]>(`/search?q=${encodeURIComponent(trimmed)}`, controller.signal)
        .then((hits) => {
          setResults(hits);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setLoading(false);
          if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
          else setError('Suche fehlgeschlagen.');
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, open]);

  function handlePick(hit: SearchHit) {
    const isAdmin = me?.role === 'admin';
    const target = isAdmin
      ? `/admin/messstellen/${hit.measuring_point_id}`
      : `/erfassen?mp=${hit.measuring_point_id}`;
    onClose();
    navigate(target);
  }

  const trimmed = query.trim();
  const showEmptyHint = trimmed.length < MIN_QUERY_LEN;
  const showNoHits = !showEmptyHint && !loading && results.length === 0 && !error;

  return (
    <Sheet open={open} onClose={onClose} title="Suche">
      <div className="space-y-3">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zählernummer, Messstelle, Standort, Notiz …"
            aria-label="Suchbegriff"
            className="block w-full rounded-pill border-hairline border-border bg-fill py-2 pl-9 pr-9 text-body-sm text-label"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Eingabe leeren"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-tertiary hover:bg-fill-strong"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {showEmptyHint ? (
          <p className="text-caption text-tertiary">
            Mindestens {MIN_QUERY_LEN} Zeichen — durchsucht Messstellen, Zählernummern, Standorte
            und Standort-Notizen.
          </p>
        ) : null}

        {loading ? <p className="text-caption text-tertiary">Suche läuft …</p> : null}

        {error ? (
          <div className="border-danger/40 bg-danger/10 rounded-pill border-hairline p-2 text-caption text-danger">
            {error}
          </div>
        ) : null}

        {showNoHits ? <p className="text-caption text-tertiary">Keine Treffer.</p> : null}

        {results.length > 0 ? (
          <ul className="space-y-2">
            {results.map((hit) => (
              <li key={`${hit.measuring_point_id}-${hit.matched_via}`}>
                <button
                  type="button"
                  onClick={() => handlePick(hit)}
                  className="bg-fill/40 hover:bg-fill/70 flex w-full flex-col gap-1 rounded-card border-hairline border-border px-3 py-2.5 text-left transition-colors"
                >
                  <span className="text-body-sm font-semibold text-label">
                    {hit.measuring_point_name}
                  </span>
                  <span className="text-caption text-tertiary">
                    {hit.main_location_name ?? '—'} › {hit.location_name ?? 'Ohne Zählerstandort'}
                  </span>
                  <span className="text-caption text-primary-deep">
                    {MATCH_LABEL[hit.matched_via]}
                    {hit.matched_detail ? `: ${hit.matched_detail}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Sheet>
  );
}
