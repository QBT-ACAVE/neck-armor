'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ArrowLeft } from 'lucide-react';
import { fetchAllMedicinesWithDoses, getSignedImageUrls } from '@/lib/meds';
import type { Medicine, MedicineDose } from '@/lib/meds-types';

export default function ManageMedsPage() {
  const [meds, setMeds] = useState<Medicine[] | null>(null);
  const [doses, setDoses] = useState<MedicineDose[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { medicines, doses } = await fetchAllMedicinesWithDoses();
      const paths = medicines.map(m => m.image_path).filter((p): p is string => !!p);
      const urls = paths.length ? await getSignedImageUrls(paths) : {};
      setMeds(medicines); setDoses(doses); setImageUrls(urls);
    })();
  }, []);

  if (meds === null) return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <Link href="/settings" className="text-xs flex items-center gap-1 mb-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={12} /> Settings
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-app">Manage Medicines</h1>
        <Link href="/settings/manage-meds/new"
          className="flex items-center gap-1 py-1.5 px-3 rounded-md text-sm font-medium"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          <Plus size={14} /> Add
        </Link>
      </div>

      {meds.length === 0 && (
        <div className="rounded-xl border p-6 text-center"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          <div className="text-sm">No medicines yet. Tap Add to start.</div>
        </div>
      )}

      <div className="space-y-2">
        {meds.map(m => {
          const dCount = doses.filter(d => d.medicine_id === m.id).length;
          const url = m.image_path ? imageUrls[m.image_path] : null;
          return (
            <Link key={m.id} href={`/settings/manage-meds/${m.id}`}
              className="flex items-center gap-3 rounded-xl p-3 border transition active:scale-[0.99]"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                opacity: m.active ? 1 : 0.5,
              }}>
              <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ background: 'var(--bg-tertiary)' }}>
                {url ? <img src={url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xl">💊</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-app truncate">{m.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {dCount} dose{dCount === 1 ? '' : 's'}{m.active ? '' : ' · paused'}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
