import type { HeatingSource, MeterType } from '@/lib/types';

export const TYPE_LABELS: Record<MeterType, string> = {
  electricity: 'Strom',
  water: 'Wasser',
  heating: 'Heizung',
};

export const HEATING_SOURCE_LABELS: Record<HeatingSource, string> = {
  oil: 'Heizöl',
  gas: 'Gas',
  wood_chips: 'Hackschnitzel',
  wood: 'Holz',
  district_heat: 'Fernwärme',
};

export const TYPE_ORDER: MeterType[] = ['electricity', 'water', 'heating'];

/** Beschriftung einer Messstelle mit Heizungs-Energieträger
 *  (z. B. „Heizung – Heizöl"). Für Strom/Wasser nur der TYPE_LABEL. */
export function describeMeterType(type: MeterType, heatingSource: HeatingSource | null): string {
  if (type === 'heating' && heatingSource !== null) {
    return `${TYPE_LABELS.heating} – ${HEATING_SOURCE_LABELS[heatingSource]}`;
  }
  return TYPE_LABELS[type];
}
