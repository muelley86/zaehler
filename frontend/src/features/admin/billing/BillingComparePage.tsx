/**
 * Vergleich frei gewählter Abrechnungsläufe eines Kreises (`?laeufe=3,7,9`, Auswahl in der Tabelle
 * der Läufe): Kennzahlen, Empfänger und Positionen nebeneinander, je Lauf eine Spalte mit der
 * Abweichung zum vorherigen Lauf. Zwei Läufe sind die Gegenüberstellung zweier Monate; ab drei
 * Läufen zeigt ein Diagramm die angeklickte Zeile als Reihe. Es wird nichts neu gerechnet.
 */
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';

import { Button, LargeTitle, Section } from '@/components/ui';
import { api } from '@/lib/api';
import type { BillingComparison } from '@/lib/types';

import { errorText } from './circleForm';
import { betragsZeilen, EINHEIT_LABEL, kennzahlZeilen, laufLabel } from './compareFormat';
import type { CompareTableRow } from './compareFormat';
import { CompareTable } from './CompareTable';
import { monatKurz } from './runFormat';

const CompareChart = lazy(() =>
  import('./CompareChart').then((m) => ({ default: m.CompareChart })),
);

const MIN_LAEUFE = 2;
/** Ab so vielen Läufen ist es eine Reihe — darunter sagt ein Diagramm nichts. */
const DIAGRAMM_AB_LAEUFEN = 3;
const STANDARD_ZEILE = 'kennzahl:weiterberechnet';

type Einheit = 'eur' | 'kwh';

/** "9,7,abc,7" → [9, 7]: nur positive ganze Zahlen, ohne Doppelte, Reihenfolge erhalten. */
function parseLaeufe(roh: string | null): number[] {
  const ids = (roh ?? '')
    .split(',')
    .map((teil) => Number(teil.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

export function BillingComparePage() {
  const { id } = useParams<{ id: string }>();
  const circleId = Number(id);
  const [params] = useSearchParams();
  const auswahl = parseLaeufe(params.get('laeufe')).join(',');
  const [daten, setDaten] = useState<{ auswahl: string; vergleich: BillingComparison } | null>(
    null,
  );
  const [fehler, setFehler] = useState<{ auswahl: string; text: string } | null>(null);
  const [einheit, setEinheit] = useState<Einheit>('eur');
  const [gewaehlt, setGewaehlt] = useState(STANDARD_ZEILE);
  const genug = auswahl.split(',').length >= MIN_LAEUFE;

  useEffect(() => {
    if (!genug) return;
    let cancelled = false;
    const query = auswahl
      .split(',')
      .map((lauf) => `lauf=${lauf}`)
      .join('&');
    api
      .get<BillingComparison>(`/billing-circles/${circleId}/runs/vergleich?${query}`)
      .then((vergleich) => {
        if (!cancelled) setDaten({ auswahl, vergleich });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFehler({ auswahl, text: errorText(err, 'Konnte den Vergleich nicht laden.') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, auswahl, genug]);

  // Antworten einer früheren Auswahl nicht mehr zeigen.
  const vergleich = daten?.auswahl === auswahl ? daten.vergleich : null;
  const fehlerText = fehler?.auswahl === auswahl ? fehler.text : null;

  const tabellen = useMemo(
    () =>
      vergleich
        ? {
            kennzahlen: kennzahlZeilen(vergleich.kennzahlen),
            empfaenger: betragsZeilen(vergleich.empfaenger, 'empfaenger', einheit),
            positionen: betragsZeilen(vergleich.positionen, 'position', einheit),
          }
        : null,
    [vergleich, einheit],
  );

  const zurueck = (
    <Link
      to={`/admin/abrechnungskreise/${circleId}`}
      className="mb-2 inline-flex items-center gap-1 text-body text-primary"
    >
      <ArrowLeft size={16} /> Abrechnungskreis
    </Link>
  );

  if (!vergleich || !tabellen) {
    return (
      <>
        {zurueck}
        <LargeTitle title="Abrechnungen vergleichen" />
        <Section header="Vergleich">
          <div className="p-5 text-caption text-tertiary">
            {!genug
              ? 'Bitte mindestens zwei Abrechnungsläufe zum Vergleichen auswählen.'
              : (fehlerText ?? 'Lade…')}
          </div>
        </Section>
      </>
    );
  }

  const { laeufe } = vergleich;
  const mitDiagramm = laeufe.length >= DIAGRAMM_AB_LAEUFEN;
  const alleZeilen: CompareTableRow[] = [
    ...tabellen.kennzahlen,
    ...tabellen.empfaenger,
    ...tabellen.positionen,
  ];
  const diagrammZeile = alleZeilen.find((z) => z.key === gewaehlt) ?? alleZeilen[0];
  const onWaehle = mitDiagramm ? setGewaehlt : undefined;
  const erster = laeufe[0];
  const letzter = laeufe[laeufe.length - 1];

  return (
    <>
      {zurueck}
      <LargeTitle
        title="Abrechnungen vergleichen"
        subtitle={
          erster && letzter
            ? `${laeufe.length} Läufe · ${monatKurz(erster.monat)} bis ${monatKurz(letzter.monat)} · Abweichung jeweils zum vorherigen Lauf`
            : undefined
        }
      />

      {mitDiagramm && diagrammZeile ? (
        <Section header={`Verlauf: ${diagrammZeile.label}`}>
          <div className="space-y-2 p-5">
            <Suspense fallback={<div className="text-caption text-tertiary">Lade Diagramm…</div>}>
              <CompareChart
                titel={diagrammZeile.label}
                einheit={EINHEIT_LABEL[diagrammZeile.einheit]}
                punkte={laeufe.map((lauf, index) => {
                  const wert = diagrammZeile.werte[index]?.wert ?? null;
                  return { x: laufLabel(lauf), wert: wert === null ? null : Number(wert) };
                })}
              />
            </Suspense>
            <p className="text-caption text-tertiary">
              Zeile in einer der Tabellen anklicken, um sie hier als Reihe zu sehen.
            </p>
          </div>
        </Section>
      ) : null}

      <Section header="Kennzahlen">
        <div className="p-5">
          <CompareTable
            titel="Kennzahlen"
            kopf="Kennzahl"
            circleId={circleId}
            laeufe={laeufe}
            zeilen={tabellen.kennzahlen}
            gewaehlt={mitDiagramm ? gewaehlt : null}
            onWaehle={onWaehle}
          />
        </div>
      </Section>

      <Section
        header={
          <div className="flex items-center justify-between gap-2">
            <span>Empfänger und Positionen</span>
            <div className="flex gap-2">
              <Button
                variant={einheit === 'eur' ? 'filled' : 'bordered'}
                size="sm"
                onClick={() => setEinheit('eur')}
              >
                Euro
              </Button>
              <Button
                variant={einheit === 'kwh' ? 'filled' : 'bordered'}
                size="sm"
                onClick={() => setEinheit('kwh')}
              >
                kWh
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 p-5">
          <CompareTable
            titel="Empfänger"
            kopf="Empfänger"
            circleId={circleId}
            laeufe={laeufe}
            zeilen={tabellen.empfaenger}
            gewaehlt={mitDiagramm ? gewaehlt : null}
            onWaehle={onWaehle}
          />
          <CompareTable
            titel="Positionen"
            kopf="Position"
            circleId={circleId}
            laeufe={laeufe}
            zeilen={tabellen.positionen}
            gewaehlt={mitDiagramm ? gewaehlt : null}
            onWaehle={onWaehle}
          />
        </div>
      </Section>
    </>
  );
}
