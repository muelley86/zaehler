/**
 * KPI-Kacheln: Summe je (Zählerart, Einheit, Richtung) im gewählten
 * Zeitraum plus eine Kachel je verrechneter Messstelle, mit Delta ggü. der
 * Vorperiode. Reine Präsentationskomponente — die Fachlogik steht in
 * `dashboardMetrics.ts::selectKpiTiles`.
 */

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Section } from '@/components/ui';
import { formatDe } from '@/lib/format';
import type { KpiTile, Sentiment } from './dashboardMetrics';

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-tertiary',
};

function DeltaIcon({ trend }: { trend: KpiTile['trend'] }) {
  if (trend === 'up') return <TrendingUp size={14} aria-hidden />;
  if (trend === 'down') return <TrendingDown size={14} aria-hidden />;
  return <Minus size={14} aria-hidden />;
}

function DeltaRow({ tile }: { tile: KpiTile }) {
  if (tile.deltaPct === null) {
    return <div className="text-caption text-tertiary">keine Vergleichsdaten</div>;
  }
  const deltaText = formatDe(tile.deltaPct, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  });
  return (
    <div
      className={`flex items-center gap-1 text-caption font-semibold ${SENTIMENT_COLOR[tile.sentiment]}`}
    >
      <DeltaIcon trend={tile.trend} />
      <span>{deltaText} %</span>
      <span className="sr-only">gegenüber Vorzeitraum</span>
    </div>
  );
}

function TileLabel({ tile }: { tile: KpiTile }) {
  if (tile.vmpId !== undefined) {
    return (
      <Link to={`/verrechnung/${tile.vmpId}`} className="hover:underline">
        {tile.label}
      </Link>
    );
  }
  return <>{tile.label}</>;
}

export interface KpiTilesProps {
  tiles: KpiTile[];
  compareLabel?: string;
}

export function KpiTiles({ tiles, compareLabel }: KpiTilesProps) {
  if (tiles.length === 0) return null;

  return (
    <Section
      header="Verbrauch im Zeitraum"
      {...(compareLabel ? { footer: `Vergleich mit ${compareLabel}` } : {})}
    >
      <ul className="grid grid-cols-2 gap-px bg-separator md:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key} className="space-y-1 bg-surface p-4">
            <div className="text-caption-bold uppercase text-tertiary">
              <TileLabel tile={tile} />
            </div>
            <div className="num text-title-3 text-label">
              {formatDe(tile.current)}{' '}
              <span className="text-caption text-tertiary">{tile.unit}</span>
            </div>
            <DeltaRow tile={tile} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
