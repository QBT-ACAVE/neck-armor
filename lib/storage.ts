'use client';

export type SetLog = {
  weight?: number | string;
  reps?: number | string;
  rpe?: number;
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

// Auto-progression: suggest next weight based on last session's RPE
export function suggestWeight(exId: string, lastBaseWeight: number, targetRPE: number): { weight: number; reason: string } {
  const h = loadHistory();
  const records = h[exId] || [];
  if (records.length === 0) return { weight: lastBaseWeight, reason: 'First time — start at base.' };

  // Get most recent session's avg RPE
  const recent = records.slice(-5);
  const avgRPE = recent.reduce((s, r) => s + (r.rpe || targetRPE), 0) / recent.length;
  const lastWeight = recent[recent.length - 1].weight;

  if (avgRPE < targetRPE - 1) return { weight: Math.round((lastWeight + 2.5) * 10) / 10, reason: `Last RPE ${avgRPE.toFixed(1)} — bump up.` };
  if (avgRPE > targetRPE + 0.5) return { weight: Math.round((lastWeight - 2.5) * 10) / 10, reason: `Last RPE ${avgRPE.toFixed(1)} — back off.` };
  return { weight: lastWeight, reason: `Last RPE ${avgRPE.toFixed(1)} — hold steady.` };
}

// Find PR for an exercise (max weight × reps product as proxy)
export function findPR(exId: string): { weight: number; reps: number | string; week: number } | null {
  const h = loadHistory();
  const records = h[exId] || [];
  if (records.length === 0) return null;
  const numericReps = (r: number | string) => typeof r === 'number' ? r : parseInt(String(r)) || 1;
  const sorted = [...records].sort((a, b) => (b.weight * numericReps(b.reps)) - (a.weight * numericReps(a.reps)));
  return { weight: sorted[0].weight, reps: sorted[0].reps, week: sorted[0].week };
}
