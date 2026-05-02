// app/meds/page.tsx
'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Pill, Settings as Cog, AlertTriangle } from 'lucide-react';
import {
  fetchScheduledDosesForDate, getSignedImageUrls, logDoseTaken, undoDoseTaken,
  localDateKey, fetchActivePrnMedicines, fetchPrnIntakesForDate, logPrnIntake,
  fetchAllMedicinesWithDoses, fetchIntakeLogsBetween, medsDayColor,
} from '@/lib/meds';
import type {
  ScheduledDoseToday, Medicine, MedicineDose, MedicineIntakeLog,
} from '@/lib/meds-types';
import MedCard from './components/MedCard';
import OverdueBanner from './components/OverdueBanner';
import PrnCard from './components/PrnCard';
import MedsDayDetail from './components/MedsDayDetail';
import MonthCalendar from '@/app/components/MonthCalendar';

const REFRESH_MS = 60_000;   // re-render once a minute so "overdue" picks up

export default function MedsPage() {
  const [items, setItems] = useState<ScheduledDoseToday[] | null>(null);
  const [prnMeds, setPrnMeds] = useState<Medicine[]>([]);
  const [prnIntakes, setPrnIntakes] = useState<MedicineIntakeLog[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Calendar
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [allMeds, setAllMeds] = useState<Medicine[]>([]);
  const [allDoses, setAllDoses] = useState<MedicineDose[]>([]);
  const [monthLogs, setMonthLogs] = useState<MedicineIntakeLog[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = localDateKey();

  const reload = useCallback(async () => {
    setError(null);
    try {
      const todayKey = localDateKey();
      const [next, prn, intakes, all] = await Promise.all([
        fetchScheduledDosesForDate(todayKey),
        fetchActivePrnMedicines(),
        fetchPrnIntakesForDate(todayKey),
        fetchAllMedicinesWithDoses(),
      ]);
      const paths = [
        ...next.map(i => i.medicine.image_path),
        ...prn.map(m => m.image_path),
      ].filter((p): p is string => !!p);
      const urls = paths.length ? await getSignedImageUrls(paths) : {};
      setItems(next);
      setPrnMeds(prn);
      setPrnIntakes(intakes);
      setImageUrls(urls);
      setAllMeds(all.medicines);
      setAllDoses(all.doses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meds');
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Reload month-range intake logs when cursor changes
  useEffect(() => {
    let alive = true;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const startKey = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endDay = new Date(y, m + 1, 0).getDate();
    const endKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    fetchIntakeLogsBetween(startKey, endKey).then((data) => {
      if (alive) setMonthLogs(data);
    });
    return () => { alive = false; };
  }, [cursor]);

  // Tick every minute so "overdue" status recomputes without user action
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const onToggle = async (item: ScheduledDoseToday) => {
    try {
      if (item.taken_at && item.intake_log_id) {
        await undoDoseTaken(item.intake_log_id);
      } else {
        await logDoseTaken(item.dose.id, localDateKey());
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const onTakePrn = async (medicineId: string) => {
    try {
      await logPrnIntake(medicineId, localDateKey());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log');
    }
  };

  if (error) {
    return (
      <div className="px-4 py-4" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red-border)', color: 'var(--accent-red)' }}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold mb-1">Couldn’t load meds</div>
            <div className="text-xs opacity-80 mb-2">{error}</div>
            <button onClick={reload}
              className="text-xs px-3 py-1.5 rounded-md border"
              style={{ borderColor: 'var(--accent-red-border)' }}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  if (items === null) {
    return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;
  }

  // Group by time-of-day
  const groups = groupByTimeWindow(items);

  const dayColor = (dateKey: string) => {
    if (dateKey === today) return 'neutral' as const;
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return medsDayColor(dt, allMeds, allDoses, monthLogs);
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold text-app">Meds</h1>
        <Link href="/settings/manage-meds" className="text-xs flex items-center gap-1"
          style={{ color: 'var(--text-secondary)' }}>
          <Cog size={14} /> Manage
        </Link>
      </div>

      <OverdueBanner scheduled={items} />

      {items.length === 0 && prnMeds.length === 0 && (
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

      {prnMeds.length > 0 && (
        <section className="mb-5">
          <div className="text-[10px] font-medium tracking-widest mb-2 uppercase"
            style={{ color: 'var(--text-secondary)' }}>As Needed</div>
          {prnMeds.map(m => (
            <PrnCard
              key={m.id}
              medicine={m}
              imageUrl={m.image_path ? (imageUrls[m.image_path] ?? null) : null}
              intakesToday={prnIntakes.filter(l => l.medicine_id === m.id)}
              onTake={() => onTakePrn(m.id)}
            />
          ))}
        </section>
      )}

      {/* Month calendar */}
      <section className="mt-2">
        <div className="text-[10px] font-medium tracking-widest mb-2 uppercase"
          style={{ color: 'var(--text-secondary)' }}>History</div>
        <MonthCalendar
          cursor={cursor}
          onCursorChange={(d) => { setCursor(d); setSelectedDay(null); }}
          dayColor={dayColor}
          selectedDayKey={selectedDay}
          onSelectDay={(k) => setSelectedDay(prev => prev === k ? null : k)}
        />
        {selectedDay && (
          <MedsDayDetail
            dateKey={selectedDay}
            medicines={allMeds}
            doses={allDoses}
            logs={monthLogs}
            onClose={() => setSelectedDay(null)}
          />
        )}
      </section>
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
