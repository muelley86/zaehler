import { useParams } from 'react-router-dom';

import type { SupplierRead } from '@/lib/types';

import { MasterDataDetailPage, formatAddress } from '../_shared/MasterDataDetailPage';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <MasterDataDetailPage<SupplierRead>
      resource="suppliers"
      id={Number(id)}
      backTo="/admin/lieferanten"
      backLabel="Lieferanten"
      fallbackTitle="Lieferant"
      getTitle={(supplier) => supplier.name}
      getRows={(supplier) => [
        { label: 'Adresse', value: formatAddress(supplier) },
        { label: 'E-Mail', value: supplier.email },
        { label: 'Telefon', value: supplier.phone },
        { label: 'USt-IdNr.', value: supplier.vat_id },
        { label: 'Steuer-Nr.', value: supplier.tax_id },
        { label: 'Notiz', value: supplier.note },
      ]}
    />
  );
}
