/** Formular-State und Request-Body des Mieter-Formulars (siehe ``MieterFormFields``). */
import type { MieterRead } from '@/lib/types';

export interface MieterFormState {
  is_company: boolean;
  first_name: string;
  last_name: string;
  address_street: string;
  address_postcode: string;
  address_city: string;
  email: string;
  phone: string;
  note: string;
}

export function emptyFormState(): MieterFormState {
  return {
    is_company: false,
    first_name: '',
    last_name: '',
    address_street: '',
    address_postcode: '',
    address_city: '',
    email: '',
    phone: '',
    note: '',
  };
}

export function fromMieter(m: MieterRead): MieterFormState {
  return {
    is_company: m.is_company,
    first_name: m.first_name ?? '',
    last_name: m.last_name,
    address_street: m.address_street ?? '',
    address_postcode: m.address_postcode ?? '',
    address_city: m.address_city ?? '',
    email: m.email ?? '',
    phone: m.phone ?? '',
    note: m.note ?? '',
  };
}

export function toBody(s: MieterFormState): Record<string, unknown> {
  return {
    is_company: s.is_company,
    // Firma trägt keinen Vornamen — ein zuvor getippter wird verworfen.
    first_name: s.is_company ? null : s.first_name || null,
    last_name: s.last_name,
    address_street: s.address_street || null,
    address_postcode: s.address_postcode || null,
    address_city: s.address_city || null,
    email: s.email || null,
    phone: s.phone || null,
    note: s.note || null,
  };
}
