import { useParams } from 'react-router-dom';

import type { MieterRead } from '@/lib/types';

import { MasterDataDetailPage, formatAddress } from '../_shared/MasterDataDetailPage';

export function MieterDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <MasterDataDetailPage<MieterRead>
      resource="mieters"
      id={Number(id)}
      backTo="/admin/mieter"
      backLabel="Mieter"
      fallbackTitle="Mieter"
      getTitle={(mieter) => mieter.display_name}
      getRows={(mieter) => [
        { label: 'Adresse', value: formatAddress(mieter) },
        { label: 'E-Mail', value: mieter.email },
        { label: 'Telefon', value: mieter.phone },
        { label: 'Notiz', value: mieter.note },
      ]}
    />
  );
}
