'use client';
import { Check, X } from 'lucide-react';
import { buildMedsDayDetail } from '@/lib/meds';
import type { Medicine, MedicineDose, MedicineIntakeLog } from '@/lib/meds-types';
import { formatTime } from '../format';

export default function MedsDayDetail({
  dateKey, medicines, doses, logs, onClose,
}: {
  dateKey: string;
  medicines: Medicine[];
  doses: MedicineDose[];
  logs: MedicineIntakeLog[];
  onClose: () => void;
}) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const items = buildMedsDayDetail(date, medicines, doses, logs);

  const scheduled = items.filter(i => i.kind === 'scheduled');
  const missed = scheduled.filter(i => i.kind === 'scheduled' && !i.taken).length;
  const headerNote =
    scheduled.length === 0 ? 'No doses scheduled.' :
    missed === 0 ? 'All doses taken' :
    `${missed} missed`;

  return (
    <div className="rounded-xl p-4 mt-3 border"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-medium text-app">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{headerNote}</div>
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--text-secondary)' }}>close</button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
          {it.kind === 'scheduled' ? (
            <>
              {it.taken
                ? <Check size={14} style={{ color: 'var(--accent-emerald)' }} />
                : <X size={14} style={{ color: 'var(--accent-red)' }} />}
              <span className="flex-1 text-app">{it.medicine.name}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{formatTime(it.dose.time_of_day)}</span>
            </>
          ) : (
            <>
              <Check size={14} style={{ color: 'var(--accent-emerald)' }} />
              <span className="flex-1 text-app">{it.medicine.name}<span className="text-[11px] ml-1" style={{ color: 'var(--text-tertiary)' }}>(as needed)</span></span>
              <span style={{ color: 'var(--text-tertiary)' }}>{new Date(it.takenAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
