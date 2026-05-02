// app/meds/components/MedCard.tsx
'use client';
import { useState } from 'react';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import { combineDateAndTime } from '@/lib/meds';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export default function MedCard({
  item,
  imageUrl,
  onToggle,
}: {
  item: ScheduledDoseToday;
  imageUrl: string | null;
  onToggle: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);

  const taken = item.taken_at !== null;
  const now = new Date();
  const due = combineDateAndTime(now, item.dose.time_of_day);
  const past = now >= due;
  const overdue = past && !taken;

  const handleCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    if (navigator.vibrate) navigator.vibrate(10);
    try { await onToggle(); } finally { setPending(false); }
  };

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      className="rounded-xl border p-3 mb-2 transition-colors cursor-pointer active:scale-[0.99]"
      style={{
        background: taken ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        borderColor: overdue ? 'var(--accent-red-border)' : 'var(--border-primary)',
        opacity: taken ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover bg-white/5" />
        ) : (
          <div className="w-14 h-14 rounded-lg flex items-center justify-center text-xl"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>💊</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-app truncate">{item.medicine.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(item.dose.time_of_day)}
            {item.dose.label ? ` · ${item.dose.label}` : ''}
          </div>
        </div>
        <button
          onClick={handleCheck}
          disabled={pending}
          aria-label={taken ? 'Undo' : 'Mark taken'}
          className="w-10 h-10 rounded-lg border flex items-center justify-center transition"
          style={{
            background: taken ? 'var(--accent-emerald)' : 'transparent',
            borderColor: taken ? 'var(--accent-emerald)' : (overdue ? 'var(--accent-red-border)' : 'var(--border-secondary)'),
          }}
        >
          {taken && <Check size={20} color="white" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t text-xs space-y-1.5"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          {item.medicine.purpose && <div><strong style={{ color: 'var(--text-primary)' }}>For:</strong> {item.medicine.purpose}</div>}
          {item.medicine.instructions && <div><strong style={{ color: 'var(--text-primary)' }}>How:</strong> {item.medicine.instructions}</div>}
          {!item.medicine.purpose && !item.medicine.instructions && (
            <div style={{ color: 'var(--text-tertiary)' }}>No notes yet.</div>
          )}
          <div className="pt-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>tap to collapse</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
