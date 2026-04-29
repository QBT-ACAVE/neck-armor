'use client';
import { supabase } from './supabase';

export type SetLog = {
  weight?: number | string;
  reps?: number | string;
  rpe?: number;
  done: boolean;
  ts?: number;
};
export type SessionLog = { [setKey: string]: SetLog };
export type Progress = { [sessionKey: string]: SessionLog };
export type ExerciseHistory = {
  [exerciseId: string]: Array<{
    week: number; day: number; setIdx: number;
    weight: number; reps: number | string; rpe?: number; ts: number;
  }>;
};
export type Settings = {
  restTimerSound: boolean;
  restTimerHaptic: boolean;
  pushNotifications: boolean;
  autoProgression: boolean;
};

const PROGRESS_KEY = 'progress';
const HISTORY_KEY = 'history';
const SETTINGS_KEY = 'settings';

// ─────────────────────────────────────────────────────────────────
// Local cache: instant reads, offline fallback, writes flushed to Supabase
// ─────────────────────────────────────────────────────────────────
const LS_PREFIX = 'neck_armor_cache_';
const cacheGet = <T,>(k: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + k) || 'null') ?? fallback; }
  catch { return fallback; }
};
const cacheSet = (k: string, v: unknown) => {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch {}
};

// ─────────────────────────────────────────────────────────────────
// Generic key/value (app_state table)
// ─────────────────────────────────────────────────────────────────
async function fetchKV<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase()
      .from('app_state').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    if (!data) return fallback;
    cacheSet(key, data.value);
    return data.value as T;
  } catch (e) {
    console.warn('[storage] fetch failed, using cache:', key, e);
    return cacheGet(key, fallback);
  }
}

let pendingWrites: Record<string, ReturnType<typeof setTimeout>> = {};
function debouncedUpsert(key: string, value: unknown, delay = 400) {
  cacheSet(key, value); // instant local
  if (pendingWrites[key]) clearTimeout(pendingWrites[key]);
  pendingWrites[key] = setTimeout(async () => {
    try {
      await supabase().from('app_state').upsert({ key, value }, { onConflict: 'key' });
    } catch (e) {
      console.warn('[storage] upsert failed:', key, e);
    }
  }, delay);
}

// ─────────────────────────────────────────────────────────────────
// Progress (sync versions for compat — read from cache, write async)
// ─────────────────────────────────────────────────────────────────
export function loadProgress(): Progress {
  return cacheGet<Progress>(PROGRESS_KEY, {});
}
export function saveProgress(p: Progress) {
  debouncedUpsert(PROGRESS_KEY, p);
}
export async function loadProgressAsync(): Promise<Progress> {
  return fetchKV<Progress>(PROGRESS_KEY, {});
}

// ─────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────
export function loadHistory(): ExerciseHistory {
  return cacheGet<ExerciseHistory>(HISTORY_KEY, {});
}
export function saveHistory(h: ExerciseHistory) {
  debouncedUpsert(HISTORY_KEY, h);
}
export async function loadHistoryAsync(): Promise<ExerciseHistory> {
  return fetchKV<ExerciseHistory>(HISTORY_KEY, {});
}

export function logToHistory(
  exId: string, week: number, day: number, setIdx: number,
  weight: number, reps: number | string, rpe?: number
) {
  const h = loadHistory();
  if (!h[exId]) h[exId] = [];
  h[exId].push({ week, day, setIdx, weight, reps, rpe, ts: Date.now() });
  saveHistory(h);
}

// ─────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: Settings = {
  restTimerSound: true, restTimerHaptic: true,
  pushNotifications: false, autoProgression: true,
};
export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...cacheGet<Partial<Settings>>(SETTINGS_KEY, {}) };
}
export function saveSettings(s: Settings) {
  debouncedUpsert(SETTINGS_KEY, s);
}
export async function loadSettingsAsync(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await fetchKV<Partial<Settings>>(SETTINGS_KEY, {})) };
}

// ─────────────────────────────────────────────────────────────────
// Initial hydration — call once on app load to pull from Supabase
// ─────────────────────────────────────────────────────────────────
export async function hydrateFromSupabase(): Promise<void> {
  try {
    const { data, error } = await supabase()
      .from('app_state').select('key, value');
    if (error) throw error;
    for (const row of data ?? []) {
      cacheSet(row.key, row.value);
    }
  } catch (e) {
    console.warn('[storage] hydrate failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────
// RPE + helpers (unchanged from original)
// ─────────────────────────────────────────────────────────────────
export const RPE_LABELS: Record<number, { emoji: string; label: string; short: string }> = {
  1: { emoji: '😌', label: 'Easy',       short: 'Easy' },
  2: { emoji: '💪', label: 'Just right', short: 'Right' },
  3: { emoji: '🥵', label: 'Hard',       short: 'Hard' },
  4: { emoji: '❌', label: 'Failed',     short: 'Fail' },
};

export function suggestWeight(exId: string, baseWeight: number, targetRPE: number): { weight: number; reason: string } {
  const h = loadHistory();
  const records = h[exId] || [];
  if (records.length === 0) return { weight: baseWeight, reason: 'Starting point.' };

  const recent = records.slice(-5);
  const ratings = recent.map(r => r.rpe).filter((r): r is number => typeof r === 'number');
  const lastWeight = recent[recent.length - 1].weight;

  if (ratings.length === 0) return { weight: lastWeight, reason: 'No recent ratings — hold.' };

  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  if (avg >= 3.5) return { weight: Math.max(0, Math.round((lastWeight - 2.5) * 10) / 10), reason: 'Too heavy — back off.' };
  if (avg >= 3.0) return { weight: lastWeight, reason: 'Pushing the limit — hold.' };
  if (avg >= 1.5) {
    if (avg <= targetRPE + 0.3) return { weight: lastWeight, reason: 'Sweet spot — keep going.' };
    return { weight: lastWeight, reason: 'On track.' };
  }
  return { weight: Math.round((lastWeight + 2.5) * 10) / 10, reason: 'Too easy — bump up.' };
}

export function findPR(exId: string): { weight: number; reps: number | string; week: number } | null {
  const h = loadHistory();
  const records = h[exId] || [];
  if (records.length === 0) return null;
  const numericReps = (r: number | string) => typeof r === 'number' ? r : parseInt(String(r)) || 1;
  const sorted = [...records].sort((a, b) => (b.weight * numericReps(b.reps)) - (a.weight * numericReps(a.reps)));
  return { weight: sorted[0].weight, reps: sorted[0].reps, week: sorted[0].week };
}
