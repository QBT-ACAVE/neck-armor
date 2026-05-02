'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateKey } from '@/lib/meds';

export type DayColor = 'green' | 'yellow' | 'red' | 'neutral';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MonthCalendar({
  cursor,
  onCursorChange,
  dayColor,
  selectedDayKey,
  onSelectDay,
}: {
  cursor: Date;
  onCursorChange: (next: Date) => void;
  dayColor: (dateKey: string) => DayColor;
  selectedDayKey: string | null;
  onSelectDay: (dateKey: string) => void;
}) {
  const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const blanks = firstDay.getDay();
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const daysInMonth = lastDay.getDate();
  const todayKey = localDateKey();

  const prev = () => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const next = () => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={prev} aria-label="Previous month"
          className="p-2 rounded" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-sm font-medium text-app">{monthLabel}</div>
        <button onClick={next} aria-label="Next month"
          className="p-2 rounded" style={{ color: 'var(--text-secondary)' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const color = dayColor(dateKey);
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDayKey;
          const isFuture = dateKey > todayKey;
          const fill = isFuture ? 'var(--bg-tertiary)' : colorFill(color);
          const textColor = isFuture
            ? 'var(--text-tertiary)'
            : color === 'neutral' ? 'var(--text-tertiary)' : 'white';
          return (
            <button
              key={day}
              onClick={() => !isFuture && onSelectDay(dateKey)}
              disabled={isFuture}
              className="aspect-square rounded text-xs font-medium flex items-center justify-center transition-transform active:scale-95 disabled:cursor-default"
              style={{
                background: fill,
                color: textColor,
                outline: isSelected
                  ? '2px solid var(--accent-emerald)'
                  : isToday ? '2px solid var(--text-primary)' : 'none',
                outlineOffset: -2,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <Legend />
    </div>
  );
}

function colorFill(c: DayColor): string {
  switch (c) {
    case 'green': return '#10b981';
    case 'yellow': return '#f59e0b';
    case 'red': return '#ef4444';
    case 'neutral': return 'var(--bg-tertiary)';
  }
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] mt-3" style={{ color: 'var(--text-secondary)' }}>
      <Sw color="#10b981" label="All hit" />
      <Sw color="#f59e0b" label="1 missed" />
      <Sw color="#ef4444" label="2+ missed" />
    </div>
  );
}

function Sw({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
