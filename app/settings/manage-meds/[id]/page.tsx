'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchMedicine } from '@/lib/meds';
import type { Medicine, MedicineDose } from '@/lib/meds-types';
import MedForm from '../_components/MedForm';

export default function EditMedPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ medicine: Medicine; doses: MedicineDose[] } | null | 'missing'>(null);

  useEffect(() => {
    fetchMedicine(id).then(d => setData(d ?? 'missing'));
  }, [id]);

  if (data === null) return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;
  if (data === 'missing') return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Medicine not found.</div>;

  return <MedForm medicine={data.medicine} doses={data.doses} />;
}
