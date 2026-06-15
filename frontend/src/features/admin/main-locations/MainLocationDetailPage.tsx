import { useParams } from 'react-router-dom';

import type { MainLocationRead } from '@/lib/types';

import { MasterDataDetailPage } from '../_shared/MasterDataDetailPage';

export function MainLocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <MasterDataDetailPage<MainLocationRead>
      resource="main-locations"
      id={Number(id)}
      backTo="/admin/hauptstandorte"
      backLabel="Hauptstandorte"
      fallbackTitle="Hauptstandort"
      getTitle={(item) => item.name}
      getRows={(item) => [{ label: 'Notiz', value: item.note }]}
    />
  );
}
