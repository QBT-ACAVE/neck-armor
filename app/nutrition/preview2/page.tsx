'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  NUTRITION_ITEMS,
  TOTAL_ITEMS,
  type NutritionItemKey,
  type NutritionLogRow,
  fetchNutritionLogs,
  toggleItem,
  computeStreak,
  isStreakAtRisk,
  localDateKey,
} from '@/lib/nutrition';
import { randomQuote, type GoatQuote } from '@/lib/goat-quotes';
import { Flame, Check, ArrowLeft, Lock as LockIcon, RefreshCw } from 'lucide-react';

export default function NutritionPreview2() {
  const [rows, setRows] = useState<NutritionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimistic, setOptimistic] = useState<Set<NutritionItemKey>>(new Set());
  const [, startTransition] = useTransition();

  const today = localDateKey();

  useEffect(() => {
    let alive = true;
    fetchNutritionLogs(60).then((data) => {
      if (!alive) return;
      setRows(data);
      const todayChecked = new Set(
        data.filter((r) => r.log_date === today).map((r) => r.item_key),
      );
      setOptimistic(todayChecked);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [today]);

  const handleToggle = (key: NutritionItemKey) => {
    if ('vibrate' in navigator) navigator.vibrate(20);
    setOptimistic((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    startTransition(async () => {
      await toggleItem(key, today);
      const fresh = await fetchNutritionLogs(60);
      setRows(fresh);
    });
  };

  const completedCount = optimistic.size;
  const streak = computeStreak(rows, today);
  const atRisk = isStreakAtRisk(rows, today) && completedCount < TOTAL_ITEMS;

  // Per-item cumulative counts for tier badges
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.item_key] = (counts[r.item_key] ?? 0) + 1;

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/nutrition" className="p-1 -ml-1" style={{ color: 'var(--text-tertiary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-medium text-app">2K + Snap Demo</h1>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              4 mechanics · pick favorites
            </div>
          </div>
        </div>
        <StreakBadge streak={streak} atRisk={atRisk} />
      </div>

      {/* ─── 1. Streak emoji milestones ─── */}
      <PanelLabel num={1} title="Streak Emoji Milestones (Snapchat)" />
      <StreakMilestoneRow streak={streak} />

      {/* ─── 2. Quotes From The Goats ─── */}
      <PanelLabel num={2} title="Quotes From The Goats" />
      <GoatQuoteCard />

      {/* ─── 3. Bronze/Silver/Gold/HOF item badges ─── */}
      <PanelLabel num={3} title="Tier Badges per Item (NBA 2K)" />
      {loading ? (
        <div className="text-center py-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-1.5 mb-6">
          {NUTRITION_ITEMS.map((item) => (
            <ItemRowTier
              key={item.key}
              item={item}
              checked={optimistic.has(item.key)}
              cumulativeCount={counts[item.key] ?? 0}
              onToggle={() => handleToggle(item.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────── shared ──────────────── */

function PanelLabel({ num, title }: { num: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-4">
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: '#fb923c', color: '#0b0b0b' }}
      >
        {num}
      </div>
      <span
        className="text-[11px] font-semibold tracking-widest"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title.toUpperCase()}
      </span>
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
    >
      <Flame size={14} />
      <span>{streak}</span>
    </div>
  );
}

/* ──────────────── 1. Streak emoji milestones ──────────────── */

function streakStage(n: number): { emoji: string; label: string; color: string; bg: string } {
  if (n >= 365) return { emoji: '⚡', label: 'Mythic Streak', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' };
  if (n >= 100) return { emoji: '🎂', label: 'Centennial',    color: '#ec4899', bg: 'rgba(236,72,153,0.15)' };
  if (n >= 30)  return { emoji: '💯', label: 'Iron Month',    color: '#facc15', bg: 'rgba(250,204,21,0.15)' };
  if (n >= 14)  return { emoji: '🚀', label: 'Liftoff',       color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' };
  if (n >= 7)   return { emoji: '⭐', label: 'Iron Week',     color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
  if (n >= 3)   return { emoji: '🔥', label: 'On Fire',       color: '#fb923c', bg: 'rgba(251,146,60,0.15)' };
  if (n >= 1)   return { emoji: '🔥', label: 'Spark',         color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
  return            { emoji: '·',  label: 'No Streak',     color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)' };
}

function StreakMilestoneRow({ streak }: { streak: number }) {
  const stage = streakStage(streak);
  const next =
    streak < 3 ? 3 :
    streak < 7 ? 7 :
    streak < 14 ? 14 :
    streak < 30 ? 30 :
    streak < 100 ? 100 :
    streak < 365 ? 365 : 365;
  const nextStage = streakStage(next);

  return (
    <div
      className="rounded-2xl p-4 mb-3 border flex items-center gap-4"
      style={{
        background: stage.bg,
        borderColor: stage.color,
      }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-4xl"
        style={{
          background: 'rgba(0,0,0,0.25)',
          boxShadow: `0 0 24px ${stage.color}`,
        }}
      >
        {stage.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium tracking-widest" style={{ color: stage.color }}>
          {stage.label.toUpperCase()}
        </div>
        <div className="text-2xl font-bold text-app">
          {streak} <span className="text-base font-normal" style={{ color: 'var(--text-tertiary)' }}>day{streak === 1 ? '' : 's'}</span>
        </div>
        {streak < 365 && (
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Next: {nextStage.emoji} at {next} days ({next - streak} to go)
          </div>
        )}
      </div>
    </div>
  );
}


/* ──────────────── 3. Quotes From The Goats ──────────────── */

function GoatQuoteCard() {
  const [quote, setQuote] = useState<GoatQuote | null>(null);

  useEffect(() => {
    setQuote(randomQuote());
  }, []);

  const cycle = () => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    let next = randomQuote();
    if (quote) {
      let guard = 0;
      while (next.text === quote.text && guard < 10) {
        next = randomQuote();
        guard++;
      }
    }
    setQuote(next);
  };

  if (!quote) {
    return (
      <div
        className="rounded-2xl p-4 mb-3 border"
        style={{ borderColor: 'var(--border-primary)', minHeight: 110 }}
      />
    );
  }

  const initials = quote.author === 'Michael Jordan' ? 'MJ' : 'KB';

  return (
    <div
      className="rounded-2xl p-5 mb-3 border relative overflow-hidden select-none"
      style={{
        background:
          'linear-gradient(135deg, rgba(251,191,36,0.10) 0%, rgba(20,20,20,0.0) 70%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.15))',
        borderColor: 'rgba(251,191,36,0.45)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px -8px rgba(251,191,36,0.25)',
      }}
    >
      {/* Background goat watermark */}
      <span
        aria-hidden
        className="absolute -right-4 -bottom-6 text-[140px] leading-none select-none pointer-events-none"
        style={{ opacity: 0.06 }}
      >
        🐐
      </span>

      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">🐐</span>
          <div
            className="text-[10px] font-semibold tracking-[0.18em]"
            style={{ color: '#fbbf24' }}
          >
            QUOTES FROM THE GOATS
          </div>
        </div>
        <button
          onClick={cycle}
          className="p-1 rounded-md transition active:scale-90"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Next quote"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Quote */}
      <div className="relative">
        <span
          aria-hidden
          className="absolute -top-2 -left-1 text-3xl leading-none"
          style={{ color: 'rgba(251,191,36,0.5)', fontFamily: 'Georgia, serif' }}
        >
          &ldquo;
        </span>
        <p
          className="text-[15px] leading-snug font-medium text-app px-4"
          style={{ fontStyle: 'italic' }}
        >
          {quote.text}
        </p>
      </div>

      {/* Attribution */}
      <div
        className="flex items-center gap-2 mt-4 pt-3 relative"
        style={{ borderTop: '1px solid rgba(251,191,36,0.18)' }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold"
          style={{
            background: 'linear-gradient(135deg, #fbbf24, #d97706)',
            color: '#0b0b0b',
            boxShadow: '0 0 12px rgba(251,191,36,0.35)',
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-app leading-tight">
            {quote.author}
          </div>
          <div
            className="text-[10px] tracking-[0.2em] uppercase mt-0.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {quote.topic}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── 4. Tier Badge per Item ──────────────── */

const ITEM_TIERS: { name: string; min: number; color: string; medal: string }[] = [
  { name: 'HOF',    min: 365, color: '#a855f7', medal: '👑' },
  { name: 'GOLD',   min: 100, color: '#fbbf24', medal: '🥇' },
  { name: 'SILVER', min: 30,  color: '#cbd5e1', medal: '🥈' },
  { name: 'BRONZE', min: 7,   color: '#cd7f32', medal: '🥉' },
];

function itemTier(count: number) {
  return ITEM_TIERS.find((t) => count >= t.min) ?? null;
}

function ItemRowTier({
  item,
  checked,
  cumulativeCount,
  onToggle,
}: {
  item: typeof NUTRITION_ITEMS[number];
  checked: boolean;
  cumulativeCount: number;
  onToggle: () => void;
}) {
  const tier = itemTier(cumulativeCount);
  const next = ITEM_TIERS.slice().reverse().find((t) => cumulativeCount < t.min);
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
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium"
          style={{
            color: checked ? 'var(--text-secondary)' : 'var(--text-primary)',
            textDecoration: checked ? 'line-through' : 'none',
          }}
        >
          {item.label}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {cumulativeCount} logged
          {next && ` · ${next.min - cumulativeCount} to ${next.name}`}
        </div>
      </div>
      {tier ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold"
          style={{
            background: `${tier.color}26`,
            color: tier.color,
            border: `1px solid ${tier.color}`,
          }}
        >
          <span>{tier.medal}</span>
          <span>{tier.name}</span>
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px]"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
        >
          <LockIcon size={10} />
          {7 - cumulativeCount > 0 ? `${7 - cumulativeCount} to Bronze` : 'Bronze'}
        </span>
      )}
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
