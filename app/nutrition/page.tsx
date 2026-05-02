'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  NUTRITION_ITEMS, TOTAL_ITEMS, type NutritionItemKey, type NutritionLogRow,
  fetchNutritionLogs, fetchNutritionLogsBetween, toggleItem,
  computeStreak, isStreakAtRisk, localDateKey,
  earliestLogDate, nutritionDayColor,
} from '@/lib/nutrition';
import { Flame, Check } from 'lucide-react';
import MonthCalendar from '@/app/components/MonthCalendar';
import FuelDayDetail from './components/FuelDayDetail';

export default function NutritionPage() {
  const [rows, setRows] = useState<NutritionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimistic, setOptimistic] = useState<Set<NutritionItemKey>>(new Set());
  const [, startTransition] = useTransition();

  const today = localDateKey();

  // Calendar
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [monthRows, setMonthRows] = useState<NutritionLogRow[]>([]);
  const [earliestKey, setEarliestKey] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Initial fetch (today's checklist + earliest date for tracking-start floor)
  useEffect(() => {
    let alive = true;
    fetchNutritionLogs(365).then((data) => {
      if (!alive) return;
      setRows(data);
      const todayChecked = new Set(
        data.filter((r) => r.log_date === today).map((r) => r.item_key)
      );
      setOptimistic(todayChecked);
      setEarliestKey(earliestLogDate(data));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [today]);

  // Reload month range when cursor changes
  useEffect(() => {
    let alive = true;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const startKey = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endDay = new Date(y, m + 1, 0).getDate();
    const endKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    fetchNutritionLogsBetween(startKey, endKey).then((data) => {
      if (!alive) return;
      setMonthRows(data);
    });
    return () => { alive = false; };
  }, [cursor]);

  const handleToggle = (key: NutritionItemKey) => {
    if ('vibrate' in navigator) navigator.vibrate(20);
    setOptimistic((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    startTransition(async () => {
      await toggleItem(key, today);
      const fresh = await fetchNutritionLogs(365);
      setRows(fresh);
      setEarliestKey(earliestLogDate(fresh));
    });
  };

  const completedCount = optimistic.size;
  const pct = (completedCount / TOTAL_ITEMS) * 100;
  const streak = computeStreak(rows, today);
  const atRisk = isStreakAtRisk(rows, today) && completedCount < TOTAL_ITEMS;

  const groups = {
    meals: NUTRITION_ITEMS.filter((i) => i.group === 'meals'),
    shakes: NUTRITION_ITEMS.filter((i) => i.group === 'shakes'),
    supplements: NUTRITION_ITEMS.filter((i) => i.group === 'supplements'),
  };

  const dayColor = useMemo(() => {
    return (dateKey: string) => {
      // Today is "in progress" — keep neutral on calendar
      if (dateKey === today) return 'neutral' as const;
      return nutritionDayColor(dateKey, monthRows, earliestKey);
    };
  }, [monthRows, earliestKey, today]);

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-xl font-medium text-app">Nutrition</h1>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Daily fuel checklist</div>
        </div>
        <StreakBadge streak={streak} atRisk={atRisk} />
      </div>

      {/* Today summary card */}
      <div
        className="rounded-xl p-4 my-4 border flex items-center justify-between"
        style={{
          background: completedCount === TOTAL_ITEMS
            ? 'linear-gradient(135deg, rgba(29,158,117,0.15), rgba(29,158,117,0.05))'
            : 'var(--bg-secondary)',
          borderColor: completedCount === TOTAL_ITEMS ? 'var(--accent-emerald)' : 'var(--border-primary)',
        }}
      >
        <div>
          <div className="text-[10px] font-medium tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>
            TODAY
          </div>
          <div className="text-3xl font-semibold text-app">
            {completedCount}<span style={{ color: 'var(--text-tertiary)' }}>/{TOTAL_ITEMS}</span>
          </div>
        </div>

        {/* Progress ring */}
        <div className="relative h-16 w-16">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--border-primary)" strokeWidth="5" />
            <circle
              cx="32" cy="32" r="27" fill="none"
              stroke="var(--accent-emerald)" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 169.65} 169.65`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-app">
            {Math.round(pct)}%
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Loading…
        </div>
      )}

      {!loading && (
        <>
          {/* Meals */}
          <SectionLabel>MEALS</SectionLabel>
          <div className="space-y-1.5 mb-5">
            {groups.meals.map((item) => (
              <CheckRow
                key={item.key} item={item}
                checked={optimistic.has(item.key)}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </div>

          {/* Shakes */}
          <SectionLabel>PROTEIN SHAKES</SectionLabel>
          <div className="space-y-1.5 mb-5">
            {groups.shakes.map((item) => (
              <CheckRow
                key={item.key} item={item}
                checked={optimistic.has(item.key)}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </div>

          {/* Supplements */}
          <SectionLabel>SUPPLEMENTS</SectionLabel>
          <div className="space-y-1.5 mb-6">
            {groups.supplements.map((item) => (
              <CheckRow
                key={item.key} item={item}
                checked={optimistic.has(item.key)}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </div>

          {/* Month calendar */}
          <SectionLabel>HISTORY</SectionLabel>
          <MonthCalendar
            cursor={cursor}
            onCursorChange={(d) => { setCursor(d); setSelectedDay(null); }}
            dayColor={dayColor}
            selectedDayKey={selectedDay}
            onSelectDay={(k) => setSelectedDay(prev => prev === k ? null : k)}
          />
          {selectedDay && (
            <FuelDayDetail
              dateKey={selectedDay}
              rows={monthRows}
              onClose={() => setSelectedDay(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium tracking-widest mb-2 mt-1" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </div>
  );
}

function StreakBadge({ streak, atRisk }: { streak: number; atRisk: boolean }) {
  if (streak === 0) {
    return (
      <div
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
      >
        <Flame size={14} />
        <span className="font-semibold">0</span>
      </div>
    );
  }
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${atRisk ? 'animate-pulse' : ''}`}
      style={{
        background: atRisk ? 'rgba(245,158,11,0.15)' : 'rgba(251,146,60,0.15)',
        border: `1px solid ${atRisk ? 'rgba(245,158,11,0.4)' : 'rgba(251,146,60,0.4)'}`,
        color: atRisk ? '#f59e0b' : '#fb923c',
      }}
      title={atRisk ? 'Complete today to keep streak alive!' : `${streak}-day streak`}
    >
      <Flame size={14} />
      <span>{streak}</span>
    </div>
  );
}

function CheckRow({
  item, checked, onToggle,
}: {
  item: typeof NUTRITION_ITEMS[number];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 rounded-lg px-3 py-3 border text-left transition-all active:scale-[0.98]"
      style={{
        background: checked ? 'rgba(29,158,117,0.12)' : 'var(--bg-secondary)',
        borderColor: checked ? 'var(--accent-emerald)' : 'var(--border-primary)',
      }}
    >
      <span className="text-2xl">{item.icon}</span>
      <span
        className="flex-1 text-sm font-medium"
        style={{
          color: checked ? 'var(--text-secondary)' : 'var(--text-primary)',
          textDecoration: checked ? 'line-through' : 'none',
        }}
      >
        {item.label}
      </span>
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all"
        style={{
          background: checked ? 'var(--accent-emerald)' : 'transparent',
          borderColor: checked ? 'var(--accent-emerald)' : 'var(--border-secondary)',
        }}
      >
        {checked && <Check size={14} color="white" strokeWidth={3} />}
      </span>
    </button>
  );
}
