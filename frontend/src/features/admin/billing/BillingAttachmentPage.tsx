/**
 * Rechnungsanhang je Empfänger als Druckansicht (Entscheidung des Nutzers 2026-09-18: HTML-Seite,
 * die per Strg+P als PDF gespeichert wird; echte PDF-Erzeugung später auf dem Server).
 *
 * Aufbau 1:1 wie das Blatt „Abrechnungsblatt Strombezug“ der Excel-Mappe (Handdateien
 * `2026-08 Abrechnung_Strombezug <Betrieb>.xlsx`): Kopf, Preisermittlung, Zählertabelle mit
 * Summenzeile, Summierung je Kostenstelle, Zusammensetzung des Betrags, Betrag gesamt netto,
 * USt.-Hinweis. Je Empfänger ein A4-Blatt (Hochformat).
 *
 * Wie Excel (`fitToPage`) wird jedes Blatt so skaliert, dass es auf **eine** Seite passt: nach dem
 * Rendern wird die Höhe gemessen und per `zoom` verkleinert (Wunsch des Nutzers 2026-09-18).
 * `zoom` kennen Chrome, Edge, Safari und Firefox ab 126; fehlt es, druckt das Blatt unverkleinert
 * (dann ggf. zwei Seiten) – die Werte bleiben in jedem Fall richtig.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateDe, formatDe } from '@/lib/format';
import type {
  BillingAttachmentHead,
  BillingAttachmentRead,
  BillingAttachmentRecipient,
  BillingAttachmentSummary,
} from '@/lib/types';

import { errorText } from './circleForm';
import { num } from './runFormat';

/** A4 hoch, Rand 10 mm, 96 dpi – Maße des Druckbereichs in CSS-Pixeln. */
const BLATT_BREITE = Math.round(((210 - 20) / 25.4) * 96);
const BLATT_HOEHE = Math.round(((297 - 20) / 25.4) * 96);
/** Weiter als bis 55 % wird nicht verkleinert – darunter ist nichts mehr lesbar. */
const MIN_ZOOM = 0.55;
/**
 * Sicherheitsreserve: Der Browser bricht im Druck anders um als am Bildschirm (Schriftmetrik,
 * Rundung der Seitenhöhe), sodass ein am Bildschirm knapp passendes Blatt sonst mit den letzten
 * Zeilen auf Seite 2 rutscht. 5 % Reserve kosten kaum Größe und halten das Blatt sicher auf einer
 * Seite.
 */
const ZIEL_HOEHE = Math.floor(BLATT_HOEHE * 0.95);

/** Beträge und Mengen stehen im Abrechnungsblatt mit zwei Nachkommastellen (ohne Einheit). */
function zwei(wert: string | null | undefined): string {
  return wert === null || wert === undefined
    ? ''
    : formatDe(wert, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STAND_HINWEIS: Record<string, string> = {
  interpoliert: 'i',
  nur_davor: '!',
  nur_danach: '!',
  manuell: 'm',
};

/**
 * Druckregeln; `@page` lässt sich nicht über Utility-Klassen setzen.
 *
 * Die Seite liegt in AppShell und AdminLayout (Navigation, Kopfzeile, Container). Ohne die
 * folgenden Regeln landet dieser Rahmen im PDF. Deshalb wird im Druck alles ausgeblendet, was
 * nicht zu einem Blatt gehört, und die Vorfahren der Blätter werden von ihrem Layout befreit –
 * gedruckt wird dann genau das, was am Bildschirm als Blatt zu sehen ist.
 */
const DRUCK_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body :not(:has(.anhang-blatt)):not(.anhang-blatt):not(.anhang-blatt *) {
    display: none !important;
  }
  body :has(.anhang-blatt) {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    background: #fff !important;
    box-shadow: none !important;
  }
  .anhang-blatt {
    margin: 0 !important;
    min-height: 0 !important;
    box-shadow: none !important;
  }
  .anhang-blatt + .anhang-blatt { break-before: page; }
}
`;

function Stand({ wert, art }: { wert: string | null; art: string | null }) {
  if (wert === null) return null;
  const zeichen = art ? STAND_HINWEIS[art] : undefined;
  return (
    <>
      {num(wert)}
      {zeichen ? <sup title={art ?? undefined}>{zeichen}</sup> : null}
    </>
  );
}

export function BillingAttachmentPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const circleId = Number(id);
  const [data, setData] = useState<BillingAttachmentRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingAttachmentRead>(`/billing-circles/${circleId}/runs/${Number(runId)}/anhang`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte den Rechnungsanhang nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, runId]);

  if (!data) {
    return error ? <div className="text-danger">{error}</div> : <div>Lade…</div>;
  }

  const { head, summary } = data;

  return (
    <div>
      <style>{DRUCK_CSS}</style>
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <Link
          to={`/admin/abrechnungskreise/${circleId}/laeufe/${runId ?? ''}`}
          className="inline-flex items-center gap-1 text-body text-primary"
        >
          <ArrowLeft size={16} /> Abrechnungslauf
        </Link>
        <Button variant="filled" leftIcon={<Printer size={14} />} onClick={() => window.print()}>
          Drucken
        </Button>
      </div>

      {data.empfaenger.map((e) => (
        <Blatt key={e.owner_name} head={head} summary={summary} recipient={e} />
      ))}
    </div>
  );
}

/** Ein A4-Blatt; der Inhalt wird auf eine Seite verkleinert, wenn er zu hoch ist. */
function Blatt({
  head,
  summary,
  recipient,
}: {
  head: BillingAttachmentHead;
  summary: BillingAttachmentSummary;
  recipient: BillingAttachmentRecipient;
}) {
  const inhalt = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = inhalt.current;
    if (!el) return;
    let abgemeldet = false;
    /**
     * `zoom` verändert die Layout-Werte, `scrollHeight` liefert also die bereits verkleinerte
     * Höhe. Darum wird für die Messung immer auf 1 zurückgesetzt – sonst würde ein zweiter
     * Durchlauf die Verkleinerung wieder aufheben.
     */
    const messen = () => {
      if (abgemeldet) return;
      const angewendet = el.style.zoom;
      el.style.zoom = '1';
      const hoehe = el.scrollHeight;
      el.style.zoom = angewendet;
      if (!hoehe) return; // ohne Layout (Tests) bleibt es bei 1
      setZoom(Math.min(1, Math.max(MIN_ZOOM, ZIEL_HOEHE / hoehe)));
    };
    messen();
    // Schriften kommen ggf. später – danach stimmt die Höhe erst wirklich.
    void document.fonts?.ready.then(messen);
    // Letzte Gelegenheit, falls sich am Bildschirm noch etwas geändert hat.
    window.addEventListener('beforeprint', messen);
    return () => {
      abgemeldet = true;
      window.removeEventListener('beforeprint', messen);
    };
  }, [head, summary, recipient]);

  const korrektur = recipient.lines.some(
    (z) => z.korrektur_kwh !== null && Number(z.korrektur_kwh),
  );
  const spalten = korrektur ? 9 : 8;

  return (
    <section
      className="anhang-blatt shadow-card mx-auto mb-6 bg-white p-0 text-black last:mb-0 print:mb-0"
      style={{ width: BLATT_BREITE, minHeight: BLATT_HOEHE }}
      aria-label={`Abrechnungsblatt ${recipient.owner_name}`}
    >
      <div
        ref={inhalt}
        style={{ zoom }}
        data-zoom={zoom.toFixed(3)}
        className="text-[10px] leading-tight"
      >
        <h1 className="mb-3 text-[15px] font-bold">Abrechnungsblatt Strombezug</h1>
        {head.status !== 'festgeschrieben' ? (
          <p className="mb-2 font-semibold">
            Entwurf – Version {head.version}, Werte können sich noch ändern.
          </p>
        ) : null}

        <table className="mb-4 w-full">
          <tbody>
            <Kopfzeile label="Rechnungsleger" wert={head.rechnungsleger} />
            <Kopfzeile
              label="Rechnungsempfänger"
              wert={`${recipient.owner_name}${
                recipient.internal_allocation ? ' (interne Umlage)' : ''
              }`}
            />
            <Kopfzeile label="Leistungsmonat" wert={head.monatsname} />
            <Kopfzeile label="Rechnungsnummer des Lieferanten" wert={head.rechnung_nummer} />
            <Kopfzeile label="Rechnungsdatum" wert={formatDateDe(head.rechnung_datum)} />
            <Kopfzeile
              label="Abrechnungszeitraum von / bis"
              wert={`${formatDateDe(head.zeitraum_von)} bis ${formatDateDe(head.zeitraum_bis)}`}
            />
            <Kopfzeile
              label="Abnahmestelle / Marktlokation"
              wert={
                head.marktlokation
                  ? `${head.abnahmestelle} / ${head.marktlokation}`
                  : head.abnahmestelle
              }
            />
          </tbody>
        </table>

        <h2 className="mb-1 text-[11px] font-bold">Preisermittlung</h2>
        <table className="mb-4 w-full">
          <tbody>
            <Kopfzeile label="Abrechnungspreis EUR/kWh" wert={formatDe(summary.preis_eur)} />
            <Kopfzeile
              label="Abrechnungspreis ct/kWh"
              wert={formatDe(summary.preis_ct, { maximumFractionDigits: 4 })}
            />
          </tbody>
        </table>

        <table
          className="mb-4 w-full border-collapse"
          aria-label={`Zähler ${recipient.owner_name}`}
        >
          <thead>
            <tr className="border-b border-black/60 text-left align-bottom">
              <th scope="col" className="py-0.5 pr-2">
                Bezeichnung
              </th>
              <th scope="col" className="py-0.5 pr-2">
                KST/KTR
              </th>
              <th scope="col" className="py-0.5 pr-2">
                Zählernummer
              </th>
              <th scope="col" className="py-0.5 pr-2 text-right">
                Wandlerfaktor
              </th>
              <th scope="col" className="py-0.5 pr-2 text-right">
                Stand alt
              </th>
              <th scope="col" className="py-0.5 pr-2 text-right">
                Stand neu
              </th>
              {korrektur ? (
                <th scope="col" className="py-0.5 pr-2 text-right">
                  Korrektur kWh
                </th>
              ) : null}
              <th scope="col" className="py-0.5 pr-2 text-right">
                Verbrauch kWh
              </th>
              <th scope="col" className="py-0.5 text-right">
                Betrag EUR
              </th>
            </tr>
          </thead>
          <tbody>
            {recipient.lines.map((z) => (
              <tr key={z.label} className="border-b border-black/10">
                <td className="py-0.5 pr-2">{z.label}</td>
                <td className="py-0.5 pr-2 tabular-nums">{z.kostenstelle ?? ''}</td>
                <td className="py-0.5 pr-2">{z.serial_numbers || 'ohne Zähler'}</td>
                <td className="py-0.5 pr-2 text-right tabular-nums">{z.transformer_factor ?? 1}</td>
                <td className="py-0.5 pr-2 text-right tabular-nums">
                  <Stand wert={z.stand_alt} art={z.stand_alt_art} />
                </td>
                <td className="py-0.5 pr-2 text-right tabular-nums">
                  <Stand wert={z.stand_neu} art={z.stand_neu_art} />
                </td>
                {korrektur ? (
                  <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(z.korrektur_kwh)}</td>
                ) : null}
                <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(z.kwh)}</td>
                <td className="py-0.5 text-right tabular-nums">{zwei(z.eur)}</td>
              </tr>
            ))}
            <tr className="border-t border-black/60 font-bold">
              <td className="py-0.5 pr-2" colSpan={spalten - 2}>
                Summe
              </td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(recipient.kwh)}</td>
              <td className="py-0.5 text-right tabular-nums">{zwei(recipient.eur)}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="mb-1 text-[11px] font-bold">Summierung je Kostenstelle</h2>
        <table
          className="mb-4 w-full border-collapse"
          aria-label={`Kostenstellen ${recipient.owner_name}`}
        >
          <thead>
            <tr className="border-b border-black/60 text-left">
              <th scope="col" className="py-0.5 pr-2">
                Kostenstelle KST/KTR
              </th>
              <th scope="col" className="py-0.5 pr-2 text-right">
                Verbrauch kWh
              </th>
              <th scope="col" className="py-0.5 text-right">
                Betrag EUR
              </th>
            </tr>
          </thead>
          <tbody>
            {recipient.kostenstellen.map((k) => (
              <tr key={k.kst ?? 'ohne'} className="border-b border-black/10">
                <td className="py-0.5 pr-2 tabular-nums">{k.kst ?? 'ohne KST/KTR'}</td>
                <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(k.kwh)}</td>
                <td className="py-0.5 text-right tabular-nums">{zwei(k.eur)}</td>
              </tr>
            ))}
            <tr className="border-t border-black/60 font-bold">
              <td className="py-0.5 pr-2">Summe</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(recipient.kwh)}</td>
              <td className="py-0.5 text-right tabular-nums">{zwei(recipient.eur)}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="mb-1 text-[11px] font-bold">Zusammensetzung des Betrags</h2>
        <table
          className="w-full border-collapse"
          aria-label={`Zusammensetzung ${recipient.owner_name}`}
        >
          <thead>
            <tr className="border-b border-black/60 text-left">
              <th scope="col" className="py-0.5 pr-2">
                Position
              </th>
              <th scope="col" className="py-0.5 pr-2 text-right">
                Menge kWh
              </th>
              <th scope="col" className="py-0.5 pr-2 text-right">
                Preis ct/kWh
              </th>
              <th scope="col" className="py-0.5 text-right">
                Betrag EUR
              </th>
            </tr>
          </thead>
          <tbody>
            {recipient.abschnitte.map((a) => (
              <Fragment key={a.name}>
                <tr>
                  <td className="pt-1 font-semibold" colSpan={4}>
                    {a.name}
                  </td>
                </tr>
                {a.positionen.map((p) => (
                  <tr key={`${a.name}-${p.name}`}>
                    <td className="py-0.5 pl-3 pr-2">{p.name}</td>
                    <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(recipient.kwh)}</td>
                    <td className="py-0.5 pr-2 text-right tabular-nums">
                      {formatDe(p.ct, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-0.5 text-right tabular-nums">{zwei(p.betrag)}</td>
                  </tr>
                ))}
                <tr className="border-b border-black/20">
                  <td className="py-0.5 pl-3 pr-2">Gesamtbetrag (netto)</td>
                  <td />
                  <td className="py-0.5 pr-2 text-right tabular-nums">
                    {formatDe(a.ct, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{zwei(a.summe)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="border-t border-black/60 font-bold">
              <td className="py-0.5 pr-2">Betrag gesamt netto EUR</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{zwei(recipient.kwh)}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">
                {formatDe(recipient.gesamt_ct, { maximumFractionDigits: 4 })}
              </td>
              <td className="py-0.5 text-right tabular-nums">{zwei(recipient.eur)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-3">
          Alle Beträge netto, zuzüglich {formatDe(summary.umsatzsteuer)} % Umsatzsteuer.
        </p>
        <p className="mt-1 text-[9px]">
          <sup>i</sup> Stand interpoliert · <sup>m</sup> Stand manuell erfasst · <sup>!</sup>{' '}
          Ablesung fehlt auf einer Seite des Stichtags
        </p>
      </div>
    </section>
  );
}

function Kopfzeile({ label, wert }: { label: string; wert: string }) {
  return (
    <tr>
      <th scope="row" className="w-[45%] py-0.5 pr-3 text-left align-top font-normal">
        {label}
      </th>
      <td className="py-0.5 font-semibold">{wert}</td>
    </tr>
  );
}
