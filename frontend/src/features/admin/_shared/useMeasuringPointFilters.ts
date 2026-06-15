import { useEffect, useMemo, useState } from 'react';

import type { DropdownOption } from '@/components/ui';
import { TYPE_LABELS, TYPE_ORDER } from '@/lib/meterLabels';
import type { MeasuringPointWithStateRead, MeterType } from '@/lib/types';

/**
 * Client-seitige Messstellen-Filter für die „Zugeordnete Messstellen"-Bereiche
 * der Stammdaten-Detailseiten — dieselben Dimensionen wie in der
 * Messstellen-Übersicht (Typ, Eigentümer, Lieferant, Mieter, Hauptstandort).
 *
 * Optionen werden aus der übergebenen Liste abgeleitet (keine Zusatz-Requests).
 * Die zur jeweiligen Detailseite gehörende Dimension wird über ``exclude``
 * ausgeblendet (z. B. Hauptstandort-Seite → kein Hauptstandort-Filter). Ein
 * Dropdown erscheint nur, wenn es tatsächlich partitionieren kann (≥2 Optionen).
 */

export type MpFilterDimension = 'type' | 'owner' | 'supplier' | 'mieter' | 'mainLocation';

export interface MpFilterControl<T extends string | number | null> {
  label: string;
  options: DropdownOption<T>[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  /** Dropdown anzeigen: nicht ausgeschlossen UND ≥2 Optionen. */
  show: boolean;
}

export interface UseMeasuringPointFiltersResult {
  filtered: MeasuringPointWithStateRead[];
  type: MpFilterControl<MeterType>;
  owner: MpFilterControl<number | null>;
  supplier: MpFilterControl<number | null>;
  mieter: MpFilterControl<number | null>;
  mainLocation: MpFilterControl<number | null>;
  hasActiveFilters: boolean;
  /** Mindestens ein Dropdown ist sichtbar (→ Filter-Leiste rendern). */
  hasVisibleFilters: boolean;
  reset: () => void;
}

/** Id+Name-Optionen aus den MPs ableiten, plus „ohne …"-Option bei `null`-Werten. */
function idOptions(
  items: MeasuringPointWithStateRead[],
  getId: (mp: MeasuringPointWithStateRead['measuring_point']) => number | null,
  getName: (mp: MeasuringPointWithStateRead['measuring_point']) => string | null,
  noneLabel: string,
): DropdownOption<number | null>[] {
  const map = new Map<number, string>();
  let hasNone = false;
  for (const { measuring_point: mp } of items) {
    const id = getId(mp);
    if (id === null) {
      hasNone = true;
      continue;
    }
    if (!map.has(id)) map.set(id, getName(mp) ?? `#${id}`);
  }
  const options: DropdownOption<number | null>[] = Array.from(map.entries()).map(([id, name]) => ({
    value: id,
    label: name,
  }));
  if (hasNone) options.push({ value: null, label: noneLabel });
  return options;
}

export function useMeasuringPointFilters(
  items: MeasuringPointWithStateRead[] | null,
  exclude: MpFilterDimension | null,
): UseMeasuringPointFiltersResult {
  const [type, setType] = useState<Set<MeterType>>(new Set());
  const [owner, setOwner] = useState<Set<number | null>>(new Set());
  const [supplier, setSupplier] = useState<Set<number | null>>(new Set());
  const [mieter, setMieter] = useState<Set<number | null>>(new Set());
  const [mainLocation, setMainLocation] = useState<Set<number | null>>(new Set());

  // Filter zurücksetzen, sobald eine neue Liste geladen wird (anderer Datensatz)
  // — sonst überschwappt eine Auswahl beim Wechsel zwischen Entitäten.
  useEffect(() => {
    setType(new Set());
    setOwner(new Set());
    setSupplier(new Set());
    setMieter(new Set());
    setMainLocation(new Set());
  }, [items]);

  const list = useMemo(() => items ?? [], [items]);

  const typeOptions = useMemo<DropdownOption<MeterType>[]>(() => {
    const present = new Set(list.map((it) => it.measuring_point.type));
    return TYPE_ORDER.filter((t) => present.has(t)).map((t) => ({
      value: t,
      label: TYPE_LABELS[t],
    }));
  }, [list]);

  const ownerOptions = useMemo(
    () =>
      idOptions(
        list,
        (mp) => mp.current_owner_id,
        (mp) => mp.current_owner_name,
        'ohne Eigentümer',
      ),
    [list],
  );
  const supplierOptions = useMemo(
    () =>
      idOptions(
        list,
        (mp) => mp.current_supplier_id,
        (mp) => mp.current_supplier_name,
        'ohne Lieferant',
      ),
    [list],
  );
  const mieterOptions = useMemo(
    () =>
      idOptions(
        list,
        (mp) => mp.current_mieter_id,
        (mp) => mp.current_mieter_name,
        'ohne Mieter',
      ),
    [list],
  );
  const mainLocationOptions = useMemo(
    () =>
      idOptions(
        list,
        (mp) => mp.main_location_id,
        (mp) => mp.main_location_name,
        'ohne Hauptstandort',
      ),
    [list],
  );

  const filtered = useMemo(
    () =>
      list.filter(({ measuring_point: mp }) => {
        return (
          (type.size === 0 || type.has(mp.type)) &&
          (owner.size === 0 || owner.has(mp.current_owner_id)) &&
          (supplier.size === 0 || supplier.has(mp.current_supplier_id)) &&
          (mieter.size === 0 || mieter.has(mp.current_mieter_id)) &&
          (mainLocation.size === 0 || mainLocation.has(mp.main_location_id))
        );
      }),
    [list, type, owner, supplier, mieter, mainLocation],
  );

  const show = (dim: MpFilterDimension, optionCount: number): boolean =>
    exclude !== dim && optionCount >= 2;

  const typeCtrl: MpFilterControl<MeterType> = {
    label: 'Typ',
    options: typeOptions,
    selected: type,
    onChange: setType,
    show: show('type', typeOptions.length),
  };
  const ownerCtrl: MpFilterControl<number | null> = {
    label: 'Eigentümer',
    options: ownerOptions,
    selected: owner,
    onChange: setOwner,
    show: show('owner', ownerOptions.length),
  };
  const supplierCtrl: MpFilterControl<number | null> = {
    label: 'Lieferant',
    options: supplierOptions,
    selected: supplier,
    onChange: setSupplier,
    show: show('supplier', supplierOptions.length),
  };
  const mieterCtrl: MpFilterControl<number | null> = {
    label: 'Mieter',
    options: mieterOptions,
    selected: mieter,
    onChange: setMieter,
    show: show('mieter', mieterOptions.length),
  };
  const mainLocationCtrl: MpFilterControl<number | null> = {
    label: 'Hauptstandort',
    options: mainLocationOptions,
    selected: mainLocation,
    onChange: setMainLocation,
    show: show('mainLocation', mainLocationOptions.length),
  };

  const hasActiveFilters =
    type.size > 0 ||
    owner.size > 0 ||
    supplier.size > 0 ||
    mieter.size > 0 ||
    mainLocation.size > 0;

  const hasVisibleFilters =
    typeCtrl.show ||
    ownerCtrl.show ||
    supplierCtrl.show ||
    mieterCtrl.show ||
    mainLocationCtrl.show;

  function reset() {
    setType(new Set());
    setOwner(new Set());
    setSupplier(new Set());
    setMieter(new Set());
    setMainLocation(new Set());
  }

  return {
    filtered,
    type: typeCtrl,
    owner: ownerCtrl,
    supplier: supplierCtrl,
    mieter: mieterCtrl,
    mainLocation: mainLocationCtrl,
    hasActiveFilters,
    hasVisibleFilters,
    reset,
  };
}
