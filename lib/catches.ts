'use client';

export type CatchEntry = {
  id: string;
  count: number;
  ts: number;       // unix ms
  note?: string;
};

const KEY = 'neck_armor_catches_v1';

export function loadCatches(): CatchEntry[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveCatches(list: CatchEntry[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function addCatch(count: number, note?: string): CatchEntry {
  const list = loadCatches();
  const entry: CatchEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    count,
    ts: Date.now(),
    note: note?.trim() || undefined,
  };
  list.push(entry);
  saveCatches(list);
  return entry;
}

export function deleteCatch(id: string) {
  const list = loadCatches().filter(e => e.id !== id);
  saveCatches(list);
}

export function updateCatch(id: string, patch: Partial<Pick<CatchEntry, 'count' | 'note'>>) {
  const list = loadCatches().map(e => e.id === id ? { ...e, ...patch } : e);
  saveCatches(list);
}

// Aggregations
export type DayBucket = { dateStr: string; date: Date; total: number; entries: CatchEntry[] };
export type MonthBucket = { monthStr: string; year: number; month: number; total: number; days: number; entries: CatchEntry[] };

const DAY_MS = 86400000;

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function groupByDay(list: CatchEntry[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const e of list) {
    const d = new Date(e.ts);
    const key = dayKey(d);
    if (!map.has(key)) {
      map.set(key, { dateStr: key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), total: 0, entries: [] });
    }
    const b = map.get(key)!;
    b.total += e.count;
    b.entries.push(e);
  }
  return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function groupByMonth(list: CatchEntry[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const e of list) {
    const d = new Date(e.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { monthStr: key, year: d.getFullYear(), month: d.getMonth(), total: 0, days: 0, entries: [] });
    }
    const b = map.get(key)!;
    b.total += e.count;
    b.entries.push(e);
  }
  // Calculate unique training days per month
  for (const b of map.values()) {
    const uniqueDays = new Set(b.entries.map(e => dayKey(new Date(e.ts))));
    b.days = uniqueDays.size;
  }
  return Array.from(map.values()).sort((a, b) => b.monthStr.localeCompare(a.monthStr));
}

export function getStats(list: CatchEntry[]) {
  const total = list.reduce((s, e) => s + e.count, 0);
  const days = new Set(list.map(e => dayKey(new Date(e.ts)))).size;
  const sessions = list.length;
  const avgPerDay = days ? Math.round(total / days) : 0;
  const avgPerSession = sessions ? Math.round(total / sessions) : 0;

  // Best day
  const dayBuckets = groupByDay(list);
  const bestDay = dayBuckets.length ? dayBuckets.reduce((b, d) => d.total > b.total ? d : b, dayBuckets[0]) : null;

  // This week / this month totals
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekTotal = list.filter(e => e.ts >= startOfWeek.getTime()).reduce((s, e) => s + e.count, 0);
  const monthTotal = list.filter(e => e.ts >= startOfMonth.getTime()).reduce((s, e) => s + e.count, 0);

  // Streak (consecutive days with at least 1 catch)
  const dayKeys = new Set(list.map(e => dayKey(new Date(e.ts))));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dayKeys.has(dayKey(cursor))) {
    streak++;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }

  return { total, days, sessions, avgPerDay, avgPerSession, bestDay, weekTotal, monthTotal, streak };
}
