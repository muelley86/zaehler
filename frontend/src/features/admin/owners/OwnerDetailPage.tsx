import { useParams } from 'react-router-dom';

import type { OwnerRead } from '@/lib/types';

import { MasterDataDetailPage, formatAddress } from '../_shared/MasterDataDetailPage';

export function OwnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <MasterDataDetailPage<OwnerRead>
      resource="owners"
      id={Number(id)}
      backTo="/admin/eigentuemer"
      backLabel="Eigentümer"
      fallbackTitle="Eigentümer"
      getTitle={(owner) => owner.name}
      getRows={(owner) => [
        { label: 'Adresse', value: formatAddress(owner) },
        { label: 'E-Mail', value: owner.email },
        { label: 'Telefon', value: owner.phone },
        { label: 'USt-IdNr.', value: owner.vat_id },
        { label: 'Steuer-Nr.', value: owner.tax_id },
        { label: 'Notiz', value: owner.note },
      ]}
    />
  );
}
