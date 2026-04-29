'use client';

export type SetLog = {
  weight?: number | string;
  reps?: number | string;
  rpe?: number; // Now 1-4 scale: 1=Easy, 2=Just right, 3=Hard, 4=Failed
  done: boolean;
  ts?: number;
};

export type SessionLog = {
  [setKey: string]: SetLog;
};

export type Progress = {
  [sessionKey: string]: SessionLog;
};

export type ExerciseHistory = {
  [exerciseId: string]: Array<{
    week: number;
    day: number;
    setIdx: number;
    weight: number;
    reps: number | string;
    rpe?: number;
    ts: number;
  }>;
};

const STORAGE_KEY = 'neck_armor_v1';
const HISTORY_KEY = 'neck_armor_history_v1';
const SETTINGS_KEY = 'neck_armor_settings_v1';

export function loadProgress(): Progress {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function saveProgress(p: Progress) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

export function loadHistory(): ExerciseHistory {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); } catch { return {}; }
}

export function saveHistory(h: ExerciseHistory) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
}

export function logToHistory(exId: string, week: number, day: number, setIdx: number, weight: number, reps: number | string, rpe?: number) {
  const h = loadHistory();
  if (!h[exId]) h[exId] = [];
  h[exId].push({ week, day, setIdx, weight, reps, rpe, ts: Date.now() });
  saveHistory(h);
}

export type Settings = {
  restTimerSound: boolean;
  restTimerHaptic: boolean;
  pushNotifications: boolean;
  autoProgression: boolean;
};

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return { restTimerSound: true, restTimerHaptic: true, pushNotifications: false, autoProgression: true };
  try {
    return { restTimerSound: true, restTimerHaptic: true, pushNotifications: false, autoProgression: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { restTimerSound: true, restTimerHaptic: true, pushNotifications: false, autoProgression: true };
  }
}

export function saveSettings(s: Settings) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// 1-4 scale labels
export const RPE_LABELS: Record<number, { emoji: string; label: string; short: string }> = {
  1: { emoji: '😌', label: 'Easy',       short: 'Easy' },
  2: { emoji: '💪', label: 'Just right', short: 'Right' },
  3: { emoji: '🥵', label: 'Hard',       short: 'Hard' },
  4: { emoji: '❌', label: 'Failed',     short: 'Fail' },
};

// Auto-progression on the 1-4 scale.
// Looks at last ~5 sets for an exercise, averages the rating, compares to target.
export function suggestWeight(exId: string, baseWeight: number, targetRPE: number): { weight: number; reason: string } {
  const h = loadHistory();
  const records = h[exId] || [];
  if (records.length === 0) return { weight: baseWeight, reason: 'Starting point.' };

  const recent = records.slice(-5);
  const ratings = recent.map(r => r.rpe).filter((r): r is number => typeof r === 'number');
  const lastWeight = recent[recent.length - 1].weight;

  if (ratings.length === 0) return { weight: lastWeight, reason: 'No recent ratings — hold.' };

  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;

  // Failed (avg ≥ 3.5) → drop weight
  if (avg >= 3.5) {
    return { weight: Math.max(0, Math.round((lastWeight - 2.5) * 10) / 10), reason: 'Too heavy — back off.' };
  }
  // Hard but not failed (3.0–3.4) → hold
  if (avg >= 3.0) {
    return { weight: lastWeight, reason: 'Pushing the limit — hold.' };
  }
  // Just right (1.5–2.9) → hold or small bump if hitting target
  if (avg >= 1.5) {
    if (avg <= targetRPE + 0.3) return { weight: lastWeight, reason: 'Sweet spot — keep going.' };
    return { weight: lastWeight, reason: 'On track.' };
  }
  // Easy (avg < 1.5) → bump up
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
