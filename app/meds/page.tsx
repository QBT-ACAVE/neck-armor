// app/meds/page.tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Pill, Settings as Cog } from 'lucide-react';
import {
  fetchScheduledDosesForDate, getSignedImageUrls, logDoseTaken, undoDoseTaken,
  localDateKey,
} from '@/lib/meds';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import MedCard from './components/MedCard';
import OverdueBanner from './components/OverdueBanner';

const REFRESH_MS = 60_000;   // re-render once a minute so "overdue" picks up

export default function MedsPage() {
  const [items, setItems] = useState<ScheduledDoseToday[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const today = localDateKey();

  const reload = useCallback(async () => {
    const next = await fetchScheduledDosesForDate(today);
    const paths = next.map(i => i.medicine.image_path).filter((p): p is string => !!p);
    const urls = paths.length ? await getSignedImageUrls(paths) : {};
    setItems(next);
    setImageUrls(urls);
  }, [today]);

  useEffect(() => { reload(); }, [reload]);

  // Tick every minute so "overdue" status recomputes without user action
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const onToggle = async (item: ScheduledDoseToday) => {
    if (item.taken_at && item.intake_log_id) {
      await undoDoseTaken(item.intake_log_id);
    } else {
      await logDoseTaken(item.dose.id, today);
    }
    await reload();
  };

  if (items === null) {
    return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;
  }

  // Group by time-of-day
  const groups = groupByTimeWindow(items);

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)', /* tick */ ['--meds-tick' as string]: tick }}>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold text-app">Meds</h1>
        <Link href="/settings/manage-meds" className="text-xs flex items-center gap-1"
          style={{ color: 'var(--text-secondary)' }}>
          <Cog size={14} /> Manage
        </Link>
      </div>

      <OverdueBanner scheduled={items} />

      {items.length === 0 && (
        <div className="rounded-xl border p-6 text-center"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          <Pill size={28} className="mx-auto mb-2 opacity-60" />
          <div className="text-sm font-medium text-app">No meds scheduled today</div>
          <div className="text-xs mt-1">Add medicines from Settings → Manage Medicines.</div>
        </div>
      )}

      {groups.map(g => (
        <section key={g.label} className="mb-5">
          <div className="text-[10px] font-medium tracking-widest mb-2 uppercase"
            style={{ color: 'var(--text-secondary)' }}>{g.label}</div>
          {g.items.map(it => (
            <MedCard
              key={it.dose.id}
              item={it}
              imageUrl={it.medicine.image_path ? (imageUrls[it.medicine.image_path] ?? null) : null}
              onToggle={() => onToggle(it)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function groupByTimeWindow(items: ScheduledDoseToday[]): { label: string; items: ScheduledDoseToday[] }[] {
  // Group by hour-of-day bucket: <11 = Morning, <17 = Midday, <20 = Evening, else Bedtime.
  const buckets: Record<string, ScheduledDoseToday[]> = {
    Morning: [], Midday: [], Evening: [], Bedtime: [],
  };
  for (const it of items) {
    const h = parseInt(it.dose.time_of_day.slice(0, 2), 10);
    const bucket = h < 11 ? 'Morning' : h < 17 ? 'Midday' : h < 20 ? 'Evening' : 'Bedtime';
    buckets[bucket].push(it);
  }
  return Object.entries(buckets)
    .filter(([_, arr]) => arr.length > 0)
    .map(([label, items]) => ({ label, items }));
}
