'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import GoatQuoteCard from '@/app/components/GoatQuoteCard';
import {
  fetchNutritionLogs,
  computeStreak as nutritionStreak,
  isStreakAtRisk as nutritionAtRisk,
  localDateKey,
} from '@/lib/nutrition';
import { loadCatchesAsync, getStats as catchesStats } from '@/lib/catches';
import { loadHistoryAsync, type ExerciseHistory } from '@/lib/storage';
import { fetchMedsStreak } from '@/lib/meds';
import { Beef, Dumbbell, Target, Flame, ChevronRight, Pill } from 'lucide-react';

const DAY_MS = 86400000;

function workoutStreakFromHistory(h: ExerciseHistory): number {
  const days = new Set<string>();
  for (const exId in h) {
    for (const r of h[exId]) {
      const d = new Date(r.ts);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.add(k);
    }
  }
  if (days.size === 0) return 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const k = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Anchor today or yesterday
  if (!days.has(k(cursor))) {
    cursor.setTime(cursor.getTime() - DAY_MS);
    if (!days.has(k(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(k(cursor))) {
    streak++;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
}

export default function HomePage() {
  const [fuelStreak, setFuelStreak] = useState<number | null>(null);
  const [fuelAtRisk, setFuelAtRisk] = useState(false);
  const [workoutStreak, setWorkoutStreak] = useState<number | null>(null);
  const [catchStreak, setCatchStreak] = useState<number | null>(null);
  const [medsStreak, setMedsStreak] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const today = localDateKey();
      const [rows, history, catches, medsStreakValue] = await Promise.all([
        fetchNutritionLogs(35),
        loadHistoryAsync(),
        loadCatchesAsync(),
        fetchMedsStreak(),
      ]);
      if (!alive) return;
      setFuelStreak(nutritionStreak(rows, today));
      setFuelAtRisk(nutritionAtRisk(rows, today));
      setWorkoutStreak(workoutStreakFromHistory(history));
      setCatchStreak(catchesStats(catches).streak);
      setMedsStreak(medsStreakValue);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-app">Reid Cave</h1>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Daily command center
        </div>
      </div>

      {/* Quote first */}
      <GoatQuoteCard />

      {/* Streaks */}
      <SectionLabel>Day Streaks</SectionLabel>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <SparkCard
          label="Fuel"
          icon="🥩"
          streak={fuelStreak}
          atRisk={fuelAtRisk}
          accent="#fb923c"
        />
        <SparkCard
          label="Workout"
          icon="💪"
          streak={workoutStreak}
          atRisk={false}
          accent="#3b82f6"
        />
        <SparkCard
          label="Meds"
          icon="💊"
          streak={medsStreak}
          atRisk={false}
          accent="#a855f7"
        />
        <SparkCard
          label="Catches"
          icon="🎯"
          streak={catchStreak}
          atRisk={false}
          accent="#10b981"
        />
      </div>

      {/* Quick links */}
      <SectionLabel>Quick Links</SectionLabel>
      <div className="space-y-2">
        <QuickLink href="/nutrition" label="Fuel" subtitle="Log today's nutrition" Icon={Beef} accent="#fb923c" />
        <QuickLink href="/workout" label="Workout" subtitle="Today's lifts" Icon={Dumbbell} accent="#3b82f6" />
        <QuickLink href="/meds" label="Meds" subtitle="Today's meds" Icon={Pill} accent="#a855f7" />
        <QuickLink href="/catches" label="Catches" subtitle="Add catches" Icon={Target} accent="#10b981" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-medium tracking-widest mb-2 mt-1 uppercase"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </div>
  );
}

function SparkCard({
  label,
  icon,
  streak,
  atRisk,
  accent,
}: {
  label: string;
  icon: string;
  streak: number | null;
  atRisk: boolean;
  accent: string;
}) {
  const loading = streak === null;
  const active = !loading && streak! > 0;
  return (
    <div
      className="rounded-2xl p-3 border flex flex-col items-center text-center"
      style={{
        background: active
          ? `linear-gradient(180deg, ${accent}1f, ${accent}05)`
          : 'var(--bg-secondary)',
        borderColor: active ? `${accent}80` : 'var(--border-primary)',
      }}
    >
      <div className="text-xl">{icon}</div>
      <div
        className="text-[9px] font-semibold tracking-widest mt-0.5"
        style={{ color: active ? accent : 'var(--text-tertiary)' }}
      >
        {label.toUpperCase()}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <Flame
          size={14}
          color={active ? accent : 'var(--text-tertiary)'}
          className={atRisk && active ? 'animate-pulse' : ''}
        />
        <span
          className="text-2xl font-bold leading-none"
          style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        >
          {loading ? '—' : streak}
        </span>
      </div>
      <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
        {active ? `day${streak === 1 ? '' : 's'}` : 'no streak'}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  subtitle,
  Icon,
  accent,
}: {
  href: string;
  label: string;
  subtitle: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-4 py-3 border transition active:scale-[0.98]"
      style={{
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ background: `${accent}26`, border: `1px solid ${accent}66` }}
      >
        <Icon size={20} color={accent} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-app">{label}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {subtitle}
        </div>
      </div>
      <ChevronRight size={18} color="var(--text-tertiary)" />
    </Link>
  );
}
