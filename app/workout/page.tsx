'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SCHEDULE, sessionKey } from '@/lib/program';
import { loadProgress, saveProgress, logToHistory, suggestWeight, loadSettings, RPE_LABELS } from '@/lib/storage';
import { ChevronLeft, ChevronRight, Play, RotateCcw, TrendingUp, CheckCircle2 } from 'lucide-react';
import RestTimer from '../components/RestTimer';
import VideoModal from '../components/VideoModal';

function WorkoutScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const idx = Math.max(0, Math.min(SCHEDULE.length - 1, parseInt(searchParams.get('idx') || '0')));
  const session = SCHEDULE[idx];
  const sKey = sessionKey(session.week, session.day);

  const [progress, setProgress] = useState<any>({});
  const [videoOpen, setVideoOpen] = useState<string | null>(null);
  const [restState, setRestState] = useState<{ active: boolean; duration: number; key: string }>({ active: false, duration: 0, key: '' });
  const [suggestions, setSuggestions] = useState<Record<string, { weight: number; reason: string }>>({});
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => { setProgress(loadProgress()); }, []);
  useEffect(() => { saveProgress(progress); }, [progress]);

  useEffect(() => {
    const settings = loadSettings();
    if (!settings.autoProgression) return;
    const next: Record<string, { weight: number; reason: string }> = {};
    session.exercises.forEach(ex => {
      if (ex.baseWeight !== null && ex.weightUnit === 'lb') {
        next[ex.id] = suggestWeight(ex.id, ex.baseWeight, ex.targetRPE);
      }
    });
    setSuggestions(next);
    setCompleted(false);
  }, [idx]);

  const sessionProgress = progress[sKey] || {};
  const totalSets = session.exercises.reduce((s, e) => s + e.sets, 0);
  const completedSets = Object.values(sessionProgress).filter((v: any) => v?.done).length;
  const setsWithData = Object.values(sessionProgress).filter((v: any) => v?.weight || v?.reps || v?.done).length;
  const pct = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;
  const sessionMarkedComplete = sessionProgress.__complete;

  const updateSet = (exIdx: number, setIdx: number, patch: any) => {
    const key = `${exIdx}_${setIdx}`;
    setProgress((p: any) => ({
      ...p,
      [sKey]: { ...p[sKey], [key]: { ...p[sKey]?.[key], ...patch } },
    }));
  };

  const toggleSet = (exIdx: number, setIdx: number) => {
    const ex = session.exercises[exIdx];
    const key = `${exIdx}_${setIdx}`;
    const cur = sessionProgress[key] || {};
    const newDone = !cur.done;

    updateSet(exIdx, setIdx, { done: newDone, ts: Date.now() });

    if (newDone) {
      const w = parseFloat(String(cur.weight)) || (ex.baseWeight ?? 0);
      const r = cur.reps || ex.reps;
      logToHistory(ex.id, session.week, session.day, setIdx, w, r, cur.rpe);
      setRestState({ active: true, duration: ex.rest, key: `${key}-${Date.now()}` });
      const settings = loadSettings();
      if (settings.restTimerHaptic && 'vibrate' in navigator) navigator.vibrate(50);
    }
  };

  const resetSession = () => {
    if (!confirm("Reset this session's progress?")) return;
    setProgress((p: any) => { const np = { ...p }; delete np[sKey]; return np; });
    setCompleted(false);
  };

  const completeWorkout = () => {
    session.exercises.forEach((ex, exIdx) => {
      for (let setIdx = 0; setIdx < ex.sets; setIdx++) {
        const key = `${exIdx}_${setIdx}`;
        const cur = sessionProgress[key];
        if (cur && (cur.weight || cur.reps) && !cur.done) {
          const w = parseFloat(String(cur.weight)) || (ex.baseWeight ?? 0);
          const r = cur.reps || ex.reps;
          logToHistory(ex.id, session.week, session.day, setIdx, w, r, cur.rpe);
        }
      }
    });

    setProgress((p: any) => ({
      ...p,
      [sKey]: { ...p[sKey], __complete: { done: true, ts: Date.now(), partialFinish: completedSets < totalSets } },
    }));

    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
    setShowCompleteConfirm(false);
    setCompleted(true);

    setTimeout(() => {
      if (idx < SCHEDULE.length - 1) {
        router.push(`/workout?idx=${idx + 1}`);
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur header-bg border-b border-app" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => router.push(`/workout?idx=${Math.max(0, idx - 1)}`)} disabled={idx === 0}
              className="p-1.5 -ml-1.5 disabled:opacity-30 text-app">
              <ChevronLeft size={20} />
            </button>
            <div className="text-center">
              <div className="text-xl font-medium tracking-tight text-app">
                WEEK {session.week} <span style={{ color: 'var(--text-tertiary)' }}>DAY {session.day}</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{session.dayName} · {session.label}</div>
            </div>
            <button onClick={() => router.push(`/workout?idx=${Math.min(SCHEDULE.length - 1, idx + 1)}`)} disabled={idx === SCHEDULE.length - 1}
              className="p-1.5 -mr-1.5 disabled:opacity-30 text-app">
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="h-1 rounded-full overflow-hidden mt-2" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: session.color }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            <span>{completedSets}/{totalSets} sets</span>
            <span>{session.phase} phase</span>
            <button onClick={resetSession} className="flex items-center gap-1 hover:opacity-80">
              <RotateCcw size={10} /> reset
            </button>
          </div>
        </div>
      </div>

      {sessionMarkedComplete && (
        <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-sm" style={{ background: `${session.color}1f`, color: session.color }}>
          <CheckCircle2 size={18} />
          <div>
            <div className="font-medium">Session complete</div>
            <div className="text-xs opacity-80">
              {sessionMarkedComplete.partialFinish ? `Finished early at ${completedSets}/${totalSets} sets` : 'All sets logged'}
            </div>
          </div>
        </div>
      )}

      <div>
        {session.exercises.map((ex, exIdx) => {
          const sugg = suggestions[ex.id];
          return (
            <div key={ex.id} className="border-b border-app px-4 py-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-medium tracking-widest px-1.5 py-0.5 rounded-full"
                  style={{ background: `${session.color}1f`, color: session.color }}>
                  {session.tag}
                </span>
                {ex.videoId && (
                  <button onClick={() => setVideoOpen(ex.videoId!)}
                    className="p-1 -m-1 flex items-center gap-1 text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--text-tertiary)' }}>
                    <Play size={11} fill="currentColor" /> demo
                  </button>
                )}
              </div>
              <div className="text-base font-medium leading-tight text-app">{ex.name}</div>
              <div className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
                {ex.equip} · Rest {ex.rest}s · Target: {RPE_LABELS[ex.targetRPE]?.emoji} {RPE_LABELS[ex.targetRPE]?.label}
              </div>
              {sugg && (
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded text-[11px]"
                  style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue-text)' }}>
                  <TrendingUp size={11} />
                  <span>Suggested: <strong>{sugg.weight} lb</strong></span>
                  <span style={{ color: 'var(--accent-blue-muted)' }}>· {sugg.reason}</span>
                </div>
              )}

              <div className="grid grid-cols-[20px_1fr_1fr_56px_36px] gap-1.5 text-[9px] font-medium tracking-widest py-1.5"
                style={{ color: 'var(--text-tertiary)' }}>
                <div>SET</div>
                <div className="text-center">WEIGHT</div>
                <div className="text-center">REPS</div>
                <div className="text-center">FELT</div>
                <div className="text-center">LOG</div>
              </div>

              {Array.from({ length: ex.sets }).map((_, setIdx) => {
                const key = `${exIdx}_${setIdx}`;
                const data = sessionProgress[key] || {};
                const placeholderWeight = ex.baseWeight !== null ? String(ex.baseWeight) : '—';
                return (
                  <div key={setIdx} className="grid grid-cols-[20px_1fr_1fr_56px_36px] gap-1.5 items-center py-0.5">
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{setIdx + 1}</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={data.weight || ''}
                      onChange={e => updateSet(exIdx, setIdx, { weight: e.target.value })}
                      placeholder={placeholderWeight}
                      className="h-9 text-center text-sm rounded-md w-full outline-none focus:ring-2"
                      style={{ background: 'var(--bg-input)' }}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={data.reps || ''}
                      onChange={e => updateSet(exIdx, setIdx, { reps: e.target.value })}
                      placeholder={ex.reps.split(' ')[0]}
                      className="h-9 text-center text-sm rounded-md w-full outline-none focus:ring-2"
                      style={{ background: 'var(--bg-input)' }}
                    />
                    <button
                      onClick={() => {
                        const cur = data.rpe;
                        // cycle: undefined → 1 → 2 → 3 → 4 → undefined
                        const next = cur === undefined ? 1 : cur === 4 ? undefined : cur + 1;
                        updateSet(exIdx, setIdx, { rpe: next });
                      }}
                      className="h-9 rounded-md w-full outline-none text-base flex items-center justify-center"
                      style={{ background: 'var(--bg-input)' }}
                      aria-label={data.rpe ? RPE_LABELS[data.rpe]?.label : 'Rate this set'}
                    >
                      {data.rpe ? RPE_LABELS[data.rpe].emoji : <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>—</span>}
                    </button>
                    <button
                      onClick={() => toggleSet(exIdx, setIdx)}
                      className="h-9 w-9 mx-auto rounded-md text-base font-medium transition-colors"
                      style={data.done
                        ? { backgroundColor: session.color, color: '#ffffff' }
                        : { background: 'var(--bg-input)', color: 'var(--text-tertiary)' }}
                    >
                      {data.done ? '✓' : '○'}
                    </button>
                  </div>
                );
              })}

              <div className="text-[10px] italic mt-2" style={{ color: 'var(--text-tertiary)' }}>{ex.cue}</div>
            </div>
          );
        })}
      </div>

      {!sessionMarkedComplete && (
        <div className="fixed left-0 right-0 z-20 px-4 pb-2" style={{ bottom: 'calc(64px + var(--safe-bottom))' }}>
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setShowCompleteConfirm(true)}
              disabled={setsWithData === 0}
              className="w-full py-3.5 rounded-xl font-medium shadow-lg transition-colors disabled:opacity-40"
              style={setsWithData > 0
                ? { backgroundColor: session.color, color: '#ffffff' }
                : { background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
            >
              {completedSets === totalSets ? 'Complete Workout' : completedSets > 0 ? `Complete Workout (${completedSets}/${totalSets})` : 'Complete Workout'}
            </button>
          </div>
        </div>
      )}

      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'var(--bg-overlay)' }}
          onClick={() => setShowCompleteConfirm(false)}>
          <div className="rounded-2xl p-5 w-full max-w-sm"
            style={{ background: 'var(--bg-modal)', boxShadow: 'var(--shadow-modal)' }}
            onClick={e => e.stopPropagation()}>
            <div className="text-lg font-medium mb-1 text-app">Complete this workout?</div>
            <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              {completedSets === totalSets
                ? "All sets logged. Nice work."
                : `You've logged ${completedSets}/${totalSets} sets. Any sets with weight/reps entered will be saved to history.`}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCompleteConfirm(false)}
                className="flex-1 py-2.5 rounded-lg font-medium"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                Keep going
              </button>
              <button onClick={completeWorkout}
                className="flex-1 py-2.5 rounded-lg font-medium"
                style={{ backgroundColor: session.color, color: '#ffffff' }}>
                Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'var(--bg-overlay)' }}>
          <div className="rounded-2xl p-8 flex flex-col items-center gap-2"
            style={{ background: 'var(--bg-modal)' }}>
            <CheckCircle2 size={48} style={{ color: session.color }} />
            <div className="text-lg font-medium text-app">Done!</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loading next session…</div>
          </div>
        </div>
      )}

      {restState.active && (
        <RestTimer
          key={restState.key}
          duration={restState.duration}
          onComplete={() => setRestState(s => ({ ...s, active: false }))}
          onSkip={() => setRestState(s => ({ ...s, active: false }))}
        />
      )}

      {videoOpen && <VideoModal videoId={videoOpen} onClose={() => setVideoOpen(null)} />}
    </div>
  );
}

export default function WorkoutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading…</div>}>
      <WorkoutScreen />
    </Suspense>
  );
}
