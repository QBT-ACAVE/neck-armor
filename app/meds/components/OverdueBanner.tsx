// app/meds/components/OverdueBanner.tsx
'use client';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import { combineDateAndTime } from '@/lib/meds';
import { AlertTriangle } from 'lucide-react';
import { formatTime } from '../format';

export default function OverdueBanner({ scheduled }: { scheduled: ScheduledDoseToday[] }) {
  const now = new Date();
  const overdue = scheduled.filter(s => {
    if (s.taken_at) return false;
    return now >= combineDateAndTime(now, s.dose.time_of_day);
  });
  if (overdue.length === 0) return null;

  const firstOverdue = overdue[0];
  const time = firstOverdue.dose.time_of_day.slice(0, 5);
  const remaining = scheduled.length - scheduled.filter(s => s.taken_at).length;

  // Past 8pm = day-end nudge
  const past8 = now.getHours() >= 20;
  const text = past8
    ? `Today: ${scheduled.length - remaining}/${scheduled.length} taken — finish before midnight to keep your streak.`
    : `${overdue.length} dose${overdue.length > 1 ? 's' : ''} overdue — ${firstOverdue.medicine.name} due at ${formatTime(time)}`;

  return (
    <div className="flex items-center gap-2 rounded-lg p-3 mb-3 border"
      style={{
        background: 'var(--accent-red-bg)',
        borderColor: 'var(--accent-red-border)',
        color: 'var(--accent-red)',
      }}>
      <AlertTriangle size={16} />
      <span className="text-xs font-medium">{text}</span>
    </div>
  );
}
