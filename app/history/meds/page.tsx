'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import {
  fetchActiveMedicinesWithDoses, fetchIntakeLogsBetween, localDateKey,
} from '@/lib/meds';
import type { Medicine, MedicineDose, MedicineIntakeLog } from '@/lib/meds-types';
import { isDoseScheduledOn } from '@/lib/cadence';
import type { DayAdherence } from '@/lib/meds';

const DAY_NAMES = ['S','M','T','W','T','F','S'];

export default function MedsHistoryPage() {
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [data, setData] = useState<{
    medicines: Medicine[];
    doses: MedicineDose[];
    logs: MedicineIntakeLog[];
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = new Date(cursor);
      start.setDate(1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1); end.setDate(0);
      const [{ medicines, doses }, logs] = await Promise.all([
        fetchActiveMedicinesWithDoses(),
        fetchIntakeLogsBetween(localDateKey(start), localDateKey(end)),
      ]);
      if (cancelled) return;
      setData({ medicines, doses, logs });
    })();
    return () => { cancelled = true; };
  }, [cursor]);

  const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(cursor); firstDay.setDate(1);
  const blanks = firstDay.getDay();
  const lastDay = new Date(cursor); lastDay.setMonth(lastDay.getMonth() + 1); lastDay.setDate(0);
  const daysInMonth = lastDay.getDate();

  const dayInfo = (day: number): { key: string; adherence: DayAdherence; scheduled: number; taken: number } => {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day, 12, 0, 0);
    const key = localDateKey(d);
    if (!data) return { key, adherence: 'no_doses', scheduled: 0, taken: 0 };
    const medById = new Map(data.medicines.map(m => [m.id, m]));
    let scheduled = 0, taken = 0;
    for (const dose of data.doses) {
      const med = medById.get(dose.medicine_id);
      if (!med) continue;
      const created = new Date(med.created_at);
      if (!isDoseScheduledOn(dose, d, { notBefore: created })) continue;
      scheduled++;
      if (data.logs.some(l => l.dose_id === dose.id && l.scheduled_date === key)) taken++;
    }
    let adherence: DayAdherence = 'no_doses';
    if (scheduled > 0) {
      adherence = taken === scheduled ? 'all' : taken === 0 ? 'none' : 'partial';
    }
    return { key, adherence, scheduled, taken };
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <Link href="/history" className="text-xs flex items-center gap-1 mb-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={12} /> History
      </Link>
      <h1 className="text-xl font-semibold mb-4 text-app">Meds History</h1>

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth() - 1); return n; })}
          className="p-2 rounded" style={{ color: 'var(--text-secondary)' }}><ChevronLeft size={18} /></button>
        <div className="text-sm font-medium text-app">{monthLabel}</div>
        <button onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth() + 1); return n; })}
          className="p-2 rounded" style={{ color: 'var(--text-secondary)' }}><ChevronRight size={18} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const info = dayInfo(day);
          const today = info.key === localDateKey();
          return (
            <button key={day} onClick={() => setSelectedDay(info.key)}
              className="aspect-square rounded text-xs font-medium flex items-center justify-center"
              style={{
                background: colorForAdherence(info.adherence),
                color: info.adherence === 'no_doses' ? 'var(--text-tertiary)' : 'white',
                outline: today ? '2px solid var(--text-primary)' : 'none',
                outlineOffset: today ? -2 : 0,
              }}>{day}</button>
          );
        })}
      </div>

      <Legend />

      {selectedDay && data && (
        <DayDetail dateKey={selectedDay} data={data} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}

function colorForAdherence(a: DayAdherence): string {
  switch (a) {
    case 'all': return '#10b981';
    case 'partial': return '#f59e0b';
    case 'none': return '#ef4444';
    case 'no_doses': return 'var(--bg-tertiary)';
  }
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] mb-4" style={{ color: 'var(--text-secondary)' }}>
      <Sw color="#10b981" label="All taken" />
      <Sw color="#f59e0b" label="Partial" />
      <Sw color="#ef4444" label="None" />
      <Sw color="var(--bg-tertiary)" label="No doses" />
    </div>
  );
  function Sw({ color, label }: { color: string; label: string }) {
    return <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: color }} /> {label}</div>;
  }
}

function DayDetail({
  dateKey, data, onClose,
}: {
  dateKey: string;
  data: { medicines: Medicine[]; doses: MedicineDose[]; logs: MedicineIntakeLog[] };
  onClose: () => void;
}) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const medById = new Map(data.medicines.map(m => [m.id, m]));
  const items: { name: string; time: string; taken: boolean }[] = [];
  for (const dose of data.doses) {
    const med = medById.get(dose.medicine_id);
    if (!med) continue;
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    const taken = data.logs.some(l => l.dose_id === dose.id && l.scheduled_date === dateKey);
    items.push({ name: med.name, time: dose.time_of_day.slice(0, 5), taken });
  }
  items.sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-app">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--text-secondary)' }}>close</button>
      </div>
      {items.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No doses scheduled.</div>
      )}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
          {it.taken ? <Check size={14} color="var(--accent-emerald)" /> : <X size={14} color="var(--accent-red)" />}
          <span className="flex-1 text-app">{it.name}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{formatTime(it.time)}</span>
        </div>
      ))}
    </div>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
