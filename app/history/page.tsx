'use client';
import { useEffect, useState } from 'react';
import { loadHistory, findPR, type ExerciseHistory } from '@/lib/storage';
import { SCHEDULE } from '@/lib/program';
import { Trophy, TrendingUp } from 'lucide-react';

export default function HistoryPage() {
  const [history, setHistory] = useState<ExerciseHistory>({});
  useEffect(() => { setHistory(loadHistory()); }, []);

  // Get all unique exercises from program
  const allExercises = Array.from(
    new Map(SCHEDULE.flatMap(s => s.exercises).map(e => [e.id, e])).values()
  );

  const totalSets = Object.values(history).reduce((s, arr) => s + arr.length, 0);
  const exercisesTrained = Object.keys(history).length;

  return (
    <div className="px-4 py-4" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-medium mb-3">History & PRs</h1>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="bg-zinc-100 rounded-lg p-3">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Sets logged</div>
          <div className="text-2xl font-medium tabular-nums">{totalSets}</div>
        </div>
        <div className="bg-zinc-100 rounded-lg p-3">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Exercises</div>
          <div className="text-2xl font-medium tabular-nums">{exercisesTrained}</div>
        </div>
      </div>

      <div className="text-[10px] font-medium tracking-widest text-zinc-500 mb-2">PERSONAL RECORDS</div>

      {totalSets === 0 ? (
        <div className="text-sm text-zinc-400 py-8 text-center">
          Log your first session to see PRs here.
        </div>
      ) : (
        <div className="space-y-2">
          {allExercises.map(ex => {
            const pr = findPR(ex.id);
            if (!pr) return null;
            const sessions = (history[ex.id] || []).length;
            return (
              <div key={ex.id} className="bg-white border border-zinc-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium leading-tight">{ex.name}</div>
                  <Trophy size={14} className="text-amber-500 shrink-0" />
                </div>
                <div className="flex items-baseline gap-2 text-xs text-zinc-500">
                  <span className="text-zinc-900 font-medium tabular-nums">{pr.weight}{ex.weightUnit !== 'level' ? ` ${ex.weightUnit}` : ''}</span>
                  <span>×</span>
                  <span className="text-zinc-900 font-medium tabular-nums">{pr.reps}</span>
                  <span className="ml-auto">Wk {pr.week} · {sessions} sessions</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
