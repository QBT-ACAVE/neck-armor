'use client';
import {
  NUTRITION_ITEMS,
  TOTAL_ITEMS,
  type NutritionItemKey,
  type NutritionLogRow,
  groupByDay,
  addDays,
  computeStreak,
  localDateKey,
} from './nutrition';

// ─── XP + Level ─────────────────────────────────────────────────

export const XP_PER_ITEM = 10;
export const XP_PERFECT_DAY = 50;

export function totalXp(rows: NutritionLogRow[]): number {
  const days = groupByDay(rows);
  let xp = rows.length * XP_PER_ITEM;
  for (const d of days.values()) if (d.isComplete) xp += XP_PERFECT_DAY;
  return xp;
}

export interface LevelInfo {
  level: number;
  name: string;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  pct: number;
}

const LEVELS: { name: string; threshold: number }[] = [
  { name: 'Rookie',   threshold: 0 },
  { name: 'Pro',      threshold: 250 },
  { name: 'Beast',    threshold: 750 },
  { name: 'Legend',   threshold: 2000 },
  { name: 'Mythic',   threshold: 5000 },
];

export function levelInfo(xp: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].threshold) idx = i;
    else break;
  }
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const xpIntoLevel = xp - cur.threshold;
  const xpForNextLevel = next ? next.threshold - cur.threshold : xpIntoLevel || 1;
  const pct = next ? (xpIntoLevel / xpForNextLevel) * 100 : 100;
  return { level: idx + 1, name: cur.name, xp, xpIntoLevel, xpForNextLevel, pct };
}

// ─── Per-item streak ──────────────────────────────────────────────

export function perItemStreak(
  rows: NutritionLogRow[],
  itemKey: NutritionItemKey,
  today: string = localDateKey(),
): number {
  const dates = new Set(
    rows.filter((r) => r.item_key === itemKey).map((r) => r.log_date),
  );
  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// ─── Achievements ─────────────────────────────────────────────────

export interface Achievement {
  key: string;
  label: string;
  icon: string;
  description: string;
  unlocked: boolean;
  progress?: { current: number; target: number };
}

export function computeAchievements(rows: NutritionLogRow[]): Achievement[] {
  const today = localDateKey();
  const days = groupByDay(rows);
  const perfectDays = Array.from(days.values()).filter((d) => d.isComplete).length;
  const overallStreak = computeStreak(rows, today);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.item_key] = (counts[r.item_key] ?? 0) + 1;
  const shakeCount = (counts.shake_1 ?? 0) + (counts.shake_2 ?? 0);

  const list: Achievement[] = [
    {
      key: 'first_drop',
      label: 'First Drop',
      icon: '💧',
      description: 'Log your first item',
      unlocked: rows.length >= 1,
    },
    {
      key: 'perfect_day',
      label: 'Perfect Day',
      icon: '🎯',
      description: 'Hit 10/10 in one day',
      unlocked: perfectDays >= 1,
    },
    {
      key: 'iron_week',
      label: 'Iron Week',
      icon: '🛡️',
      description: '7-day streak',
      unlocked: overallStreak >= 7,
      progress: { current: Math.min(overallStreak, 7), target: 7 },
    },
    {
      key: 'hydrator',
      label: 'Hydrator',
      icon: '🌊',
      description: '20 protein shakes',
      unlocked: shakeCount >= 20,
      progress: { current: Math.min(shakeCount, 20), target: 20 },
    },
    {
      key: 'powerhouse',
      label: 'Powerhouse',
      icon: '💪',
      description: '30 days of creatine',
      unlocked: (counts.creatine ?? 0) >= 30,
      progress: { current: Math.min(counts.creatine ?? 0, 30), target: 30 },
    },
    {
      key: 'full_send',
      label: 'Full Send',
      icon: '👑',
      description: '30-day overall streak',
      unlocked: overallStreak >= 30,
      progress: { current: Math.min(overallStreak, 30), target: 30 },
    },
  ];
  return list;
}

// ─── Daily Quest ──────────────────────────────────────────────────

export interface DailyQuest {
  key: string;
  title: string;
  description: string;
  rewardXp: number;
  current: number;
  target: number;
  completed: boolean;
  items: NutritionItemKey[];
}

export function todaysQuest(
  rows: NutritionLogRow[],
  today: string = localDateKey(),
): DailyQuest {
  const todayItems = new Set(
    rows.filter((r) => r.log_date === today).map((r) => r.item_key),
  );
  const dayOfWeek = new Date(today + 'T12:00:00').getDay();

  const quests: Omit<DailyQuest, 'current' | 'completed'>[] = [
    {
      key: 'meals_only',
      title: 'Meal Run',
      description: 'Log breakfast, lunch, and dinner',
      rewardXp: 25,
      target: 3,
      items: ['breakfast', 'lunch', 'dinner'],
    },
    {
      key: 'shakes_today',
      title: 'Double Shake',
      description: 'Both protein shakes today',
      rewardXp: 25,
      target: 2,
      items: ['shake_1', 'shake_2'],
    },
    {
      key: 'supps_stack',
      title: 'Supplement Stack',
      description: 'All 3 supplements in one day',
      rewardXp: 25,
      target: 3,
      items: ['creatine', 'allergy', 'vitamin_d'],
    },
    {
      key: 'full_send_day',
      title: 'Full Send',
      description: 'Hit all 10 items today',
      rewardXp: 75,
      target: TOTAL_ITEMS,
      items: NUTRITION_ITEMS.map((i) => i.key),
    },
  ];

  const pick = quests[dayOfWeek % quests.length];
  const current = pick.items.filter((k) => todayItems.has(k)).length;
  return {
    ...pick,
    current,
    completed: current >= pick.target,
  };
}
