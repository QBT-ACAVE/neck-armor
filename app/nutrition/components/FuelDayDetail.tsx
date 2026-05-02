'use client';
import { Check, X } from 'lucide-react';
import { nutritionDayDetail, TOTAL_ITEMS } from '@/lib/nutrition';
import type { NutritionLogRow } from '@/lib/nutrition';

export default function FuelDayDetail({
  dateKey, rows, onClose,
}: {
  dateKey: string;
  rows: NutritionLogRow[];
  onClose: () => void;
}) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const items = nutritionDayDetail(dateKey, rows);
  const completed = items.filter(i => i.checked).length;
  const missed = TOTAL_ITEMS - completed;
  const headerNote =
    missed === 0 ? `All ${TOTAL_ITEMS} hit` :
    `${completed}/${TOTAL_ITEMS} — ${missed} missed`;

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
      {items.map(({ item, checked }) => (
        <div key={item.key} className="flex items-center gap-2 py-1.5 text-sm">
          {checked
            ? <Check size={14} style={{ color: 'var(--accent-emerald)' }} />
            : <X size={14} style={{ color: 'var(--accent-red)' }} />}
          <span className="text-base w-5 text-center">{item.icon}</span>
          <span className="flex-1 text-app">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
