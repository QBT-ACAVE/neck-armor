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
import {
  totalXp,
  levelInfo,
  perItemStreak,
  computeAchievements,
  todaysQuest,
  type Achievement,
  type DailyQuest,
} from '@/lib/nutrition-gamify';
import { Flame, Check, Lock, ArrowLeft } from 'lucide-react';

export default function NutritionPreview() {
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
    return () => {
      alive = false;
    };
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
  const pct = (completedCount / TOTAL_ITEMS) * 100;
  const streak = computeStreak(rows, today);
  const atRisk = isStreakAtRisk(rows, today) && completedCount < TOTAL_ITEMS;
  const xp = totalXp(rows);
  const lvl = levelInfo(xp);
  const achievements = computeAchievements(rows);
  const quest = todaysQuest(rows, today);
  const isFullSend = completedCount === TOTAL_ITEMS;

  const groups = {
    meals: NUTRITION_ITEMS.filter((i) => i.group === 'meals'),
    shakes: NUTRITION_ITEMS.filter((i) => i.group === 'shakes'),
    supplements: NUTRITION_ITEMS.filter((i) => i.group === 'supplements'),
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link
            href="/nutrition"
            className="p-1 -ml-1 rounded-md"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-medium text-app">Fuel · Preview</h1>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Gamified test page
            </div>
          </div>
        </div>
        <StreakBadge streak={streak} atRisk={atRisk} />
      </div>

      {/* ─── 1. Fuel Gauge Hero ─── */}
      <FuelGauge pct={pct} count={completedCount} total={TOTAL_ITEMS} fullSend={isFullSend} />

      {/* ─── 2. XP + Level ─── */}
      <LevelBar lvl={lvl} />

      {/* ─── 3. Daily Quest ─── */}
      <QuestCard quest={quest} />

      {loading && (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Loading…
        </div>
      )}

      {!loading && (
        <>
          {/* ─── 4. Items by group with rings + per-item streaks ─── */}
          <GroupBlock
            label="Meals"
            count={groups.meals.filter((i) => optimistic.has(i.key)).length}
            total={groups.meals.length}
            color="var(--accent-emerald)"
          />
          <div className="space-y-1.5 mb-5">
            {groups.meals.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                checked={optimistic.has(item.key)}
                streak={perItemStreak(rows, item.key, today)}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </div>

          <GroupBlock
            label="Protein Shakes"
            count={groups.shakes.filter((i) => optimistic.has(i.key)).length}
            total={groups.shakes.length}
            color="#3b82f6"
          />
          <div className="space-y-1.5 mb-5">
            {groups.shakes.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                checked={optimistic.has(item.key)}
                streak={perItemStreak(rows, item.key, today)}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </div>

          <GroupBlock
            label="Supplements"
            count={groups.supplements.filter((i) => optimistic.has(i.key)).length}
            total={groups.supplements.length}
            color="#a855f7"
          />
          <div className="space-y-1.5 mb-6">
            {groups.supplements.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                checked={optimistic.has(item.key)}
                streak={perItemStreak(rows, item.key, today)}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </div>

          {/* ─── 5. Achievements ─── */}
          <SectionLabel>Achievements</SectionLabel>
          <AchievementGrid items={achievements} />
        </>
      )}
    </div>
  );
}

/* ──────────────── components ──────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-medium tracking-widest mb-2 mt-1"
      style={{ color: 'var(--text-secondary)' }}
    >
      {String(children).toUpperCase()}
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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
        atRisk ? 'animate-pulse' : ''
      }`}
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

function FuelGauge({
  pct,
  count,
  total,
  fullSend,
}: {
  pct: number;
  count: number;
  total: number;
  fullSend: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4 mb-3 border relative overflow-hidden"
      style={{
        background: fullSend
          ? 'linear-gradient(135deg, rgba(251,146,60,0.18), rgba(239,68,68,0.10))'
          : 'linear-gradient(135deg, rgba(251,146,60,0.10), rgba(251,146,60,0.02))',
        borderColor: fullSend ? '#fb923c' : 'var(--border-primary)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div
            className="text-[10px] font-medium tracking-widest"
            style={{ color: 'var(--text-secondary)' }}
          >
            FUEL TANK · TODAY
          </div>
          <div className="text-3xl font-semibold text-app mt-0.5">
            {count}
            <span style={{ color: 'var(--text-tertiary)' }}>/{total}</span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[10px] font-medium tracking-widest"
            style={{ color: 'var(--text-secondary)' }}
          >
            {fullSend ? 'FULL SEND' : pct >= 75 ? 'ALMOST FULL' : pct >= 25 ? 'FUELING UP' : 'TANK LOW'}
          </div>
          <div
            className="text-2xl font-semibold mt-0.5"
            style={{ color: fullSend ? '#fb923c' : 'var(--text-primary)' }}
          >
            {Math.round(pct)}%
          </div>
        </div>
      </div>

      {/* Horizontal fuel gauge */}
      <div className="relative">
        <div
          className="h-5 rounded-full overflow-hidden border"
          style={{
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: fullSend
                ? 'linear-gradient(90deg, #fb923c, #ef4444)'
                : pct >= 75
                  ? 'linear-gradient(90deg, #fbbf24, #fb923c)'
                  : pct >= 25
                    ? 'linear-gradient(90deg, #f97316, #fbbf24)'
                    : 'linear-gradient(90deg, #ef4444, #f97316)',
              boxShadow: fullSend ? '0 0 16px rgba(251,146,60,0.6)' : 'none',
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] font-medium tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}>
          <span>E</span>
          <span>¼</span>
          <span>½</span>
          <span>¾</span>
          <span>F</span>
        </div>
      </div>
    </div>
  );
}

function LevelBar({ lvl }: { lvl: ReturnType<typeof levelInfo> }) {
  return (
    <div
      className="rounded-2xl p-4 mb-3 border"
      style={{
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #fb923c)',
              color: '#0b0b0b',
            }}
          >
            L{lvl.level}
          </div>
          <div>
            <div className="text-sm font-semibold text-app">{lvl.name}</div>
            <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {lvl.xpIntoLevel} / {lvl.xpForNextLevel} XP to next
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            TOTAL XP
          </div>
          <div className="text-lg font-semibold text-app">{lvl.xp.toLocaleString()}</div>
        </div>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--border-primary)' }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${lvl.pct}%`,
            background: 'linear-gradient(90deg, #fbbf24, #fb923c)',
          }}
        />
      </div>
    </div>
  );
}

function QuestCard({ quest }: { quest: DailyQuest }) {
  const pct = Math.min(100, (quest.current / quest.target) * 100);
  return (
    <div
      className="rounded-2xl p-4 mb-3 border"
      style={{
        background: quest.completed
          ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.04))'
          : 'linear-gradient(135deg, rgba(168,85,247,0.10), rgba(168,85,247,0.02))',
        borderColor: quest.completed ? '#a855f7' : 'rgba(168,85,247,0.3)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚔️</span>
          <div>
            <div className="text-[10px] font-medium tracking-widest"
              style={{ color: '#c084fc' }}>
              DAILY QUEST {quest.completed && '· DONE'}
            </div>
            <div className="text-sm font-semibold text-app">{quest.title}</div>
          </div>
        </div>
        <div
          className="px-2 py-0.5 rounded-md text-xs font-bold"
          style={{
            background: quest.completed ? '#a855f7' : 'rgba(168,85,247,0.2)',
            color: quest.completed ? '#fff' : '#c084fc',
          }}
        >
          +{quest.rewardXp} XP
        </div>
      </div>
      <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        {quest.description}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--border-primary)' }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              background: quest.completed ? '#a855f7' : '#c084fc',
            }}
          />
        </div>
        <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
          {quest.current}/{quest.target}
        </span>
      </div>
    </div>
  );
}

function GroupBlock({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = (count / total) * 100;
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <div className="relative h-6 w-6">
        <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r={r} fill="none" stroke="var(--border-primary)" strokeWidth="3" />
          <circle
            cx="12"
            cy="12"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            className="transition-all duration-500"
          />
        </svg>
      </div>
      <span
        className="text-[10px] font-medium tracking-widest flex-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label.toUpperCase()}
      </span>
      <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
        {count}/{total}
      </span>
    </div>
  );
}

function ItemRow({
  item,
  checked,
  streak,
  onToggle,
}: {
  item: typeof NUTRITION_ITEMS[number];
  checked: boolean;
  streak: number;
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
      {streak >= 2 && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
          style={{
            background: streak >= 7 ? 'rgba(239,68,68,0.18)' : 'rgba(251,146,60,0.15)',
            color: streak >= 7 ? '#ef4444' : '#fb923c',
          }}
          title={`${streak}-day streak`}
        >
          🔥{streak}
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

function AchievementGrid({ items }: { items: Achievement[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-6">
      {items.map((a) => (
        <div
          key={a.key}
          className="rounded-xl p-3 border flex flex-col items-center text-center"
          style={{
            background: a.unlocked
              ? 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,146,60,0.05))'
              : 'var(--bg-secondary)',
            borderColor: a.unlocked ? '#fbbf24' : 'var(--border-primary)',
            opacity: a.unlocked ? 1 : 0.55,
          }}
        >
          <div className="relative">
            <span className="text-2xl">{a.icon}</span>
            {!a.unlocked && (
              <Lock
                size={10}
                className="absolute -bottom-0.5 -right-1"
                color="var(--text-tertiary)"
              />
            )}
          </div>
          <div className="text-[11px] font-semibold mt-1 text-app">{a.label}</div>
          <div className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
            {a.description}
          </div>
          {a.progress && !a.unlocked && (
            <div
              className="mt-1.5 w-full h-0.5 rounded-full overflow-hidden"
              style={{ background: 'var(--border-primary)' }}
            >
              <div
                className="h-full"
                style={{
                  width: `${(a.progress.current / a.progress.target) * 100}%`,
                  background: '#fbbf24',
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
