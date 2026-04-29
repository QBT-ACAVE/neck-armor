'use client';
import { supabase } from './supabase';

export const NUTRITION_ITEMS = [
  { key: 'breakfast',  label: 'Breakfast',     group: 'meals',       icon: '🍳' },
  { key: 'lunch',      label: 'Lunch',         group: 'meals',       icon: '🥪' },
  { key: 'dinner',     label: 'Dinner',        group: 'meals',       icon: '🍽️' },
  { key: 'snack_1',    label: 'Snack 1',       group: 'meals',       icon: '🍎' },
  { key: 'snack_2',    label: 'Snack 2',       group: 'meals',       icon: '🥨' },
  { key: 'shake_1',    label: 'Protein Shake 1', group: 'shakes',    icon: '🥤' },
  { key: 'shake_2',    label: 'Protein Shake 2', group: 'shakes',    icon: '🥤' },
  { key: 'creatine',   label: 'Creatine',      group: 'supplements', icon: '💪' },
  { key: 'allergy',    label: 'Allergy Med',   group: 'supplements', icon: '💊' },
  { key: 'vitamin_d',  label: 'Vitamin D',     group: 'supplements', icon: '☀️' },
] as const;

export type NutritionItemKey = typeof NUTRITION_ITEMS[number]['key'];
export const TOTAL_ITEMS = NUTRITION_ITEMS.length; // 10

export type NutritionLogRow = {
  id: string;
  log_date: string;     // YYYY-MM-DD
  item_key: NutritionItemKey;
  completed_at: string;
};

export type DayCompletion = {
  date: string;
  completed: NutritionItemKey[];
  total: number;
  isComplete: boolean;
};

// ─── Date helpers ────────────────────────────────────────────────
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDateKey(dt);
}

// ─── Aggregation ─────────────────────────────────────────────────
export function groupByDay(rows: NutritionLogRow[]): Map<string, DayCompletion> {
  const map = new Map<string, DayCompletion>();
  for (const r of rows) {
    const existing = map.get(r.log_date) ?? {
      date: r.log_date, completed: [] as NutritionItemKey[], total: 0, isComplete: false,
    };
    if (!existing.completed.includes(r.item_key)) {
      existing.completed.push(r.item_key);
      existing.total = existing.completed.length;
      existing.isComplete = existing.total >= TOTAL_ITEMS;
    }
    map.set(r.log_date, existing);
  }
  return map;
}

/** Snapchat-style streak: consecutive complete days ending today or yesterday */
export function computeStreak(rows: NutritionLogRow[], today: string = localDateKey()): number {
  const days = groupByDay(rows);
  const yesterday = addDays(today, -1);

  let anchor: string;
  if (days.get(today)?.isComplete) anchor = today;
  else if (days.get(yesterday)?.isComplete) anchor = yesterday;
  else return 0;

  let streak = 0;
  let cursor = anchor;
  while (days.get(cursor)?.isComplete) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function isStreakAtRisk(rows: NutritionLogRow[], today: string = localDateKey()): boolean {
  const days = groupByDay(rows);
  if (days.get(today)?.isComplete) return false;
  return days.get(addDays(today, -1))?.isComplete ?? false;
}

export function weeklySummary(
  rows: NutritionLogRow[], endDate: string = localDateKey(), windowDays: number = 7
): { item: NutritionItemKey; count: number; pct: number }[] {
  const start = addDays(endDate, -(windowDays - 1));
  const counts = new Map<NutritionItemKey, number>();
  for (const r of rows) {
    if (r.log_date >= start && r.log_date <= endDate) {
      counts.set(r.item_key, (counts.get(r.item_key) ?? 0) + 1);
    }
  }
  return NUTRITION_ITEMS.map((it) => {
    const count = counts.get(it.key) ?? 0;
    return { item: it.key, count, pct: Math.round((count / windowDays) * 100) };
  });
}

export function monthlySummary(
  rows: NutritionLogRow[], refDate: string = localDateKey()
): { item: NutritionItemKey; count: number; pct: number; daysInWindow: number }[] {
  const [y, m] = refDate.split('-').map(Number);
  const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
  const today = new Date();
  const daysElapsed =
    today.getFullYear() === y && today.getMonth() + 1 === m
      ? today.getDate()
      : new Date(y, m, 0).getDate();

  const counts = new Map<NutritionItemKey, number>();
  for (const r of rows) {
    if (r.log_date.startsWith(monthPrefix)) {
      counts.set(r.item_key, (counts.get(r.item_key) ?? 0) + 1);
    }
  }
  return NUTRITION_ITEMS.map((it) => {
    const count = counts.get(it.key) ?? 0;
    return {
      item: it.key, count,
      pct: Math.round((count / daysElapsed) * 100),
      daysInWindow: daysElapsed,
    };
  });
}

// ─── Data access ─────────────────────────────────────────────────
export async function fetchNutritionLogs(daysBack: number = 35): Promise<NutritionLogRow[]> {
  const start = addDays(localDateKey(), -daysBack);
  const { data, error } = await supabase()
    .from('nutrition_log')
    .select('*')
    .gte('log_date', start)
    .order('log_date', { ascending: false });
  if (error) {
    console.warn('[nutrition] fetch failed:', error);
    return [];
  }
  return (data ?? []) as NutritionLogRow[];
}

export async function toggleItem(itemKey: NutritionItemKey, dateKey: string = localDateKey()) {
  const { data: existing } = await supabase()
    .from('nutrition_log').select('id')
    .eq('log_date', dateKey).eq('item_key', itemKey).maybeSingle();

  if (existing) {
    await supabase().from('nutrition_log').delete().eq('id', existing.id);
    return { checked: false };
  }
  await supabase().from('nutrition_log').insert({ log_date: dateKey, item_key: itemKey });
  return { checked: true };
}
