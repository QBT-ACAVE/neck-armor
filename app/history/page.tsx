'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadHistory, findPR, type ExerciseHistory } from '@/lib/storage';
import { SCHEDULE } from '@/lib/program';
import { Trophy } from 'lucide-react';

export default function HistoryPage() {
  const [history, setHistory] = useState<ExerciseHistory>({});
  useEffect(() => { setHistory(loadHistory()); }, []);

  const allExercises = Array.from(
    new Map(SCHEDULE.flatMap(s => s.exercises).map(e => [e.id, e])).values()
  );

  const totalSets = Object.values(history).reduce((s, arr) => s + arr.length, 0);
  const exercisesTrained = Object.keys(history).length;

  return (
    <div className="px-4 py-4" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-medium mb-3 text-app">History & PRs</h1>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="rounded-lg p-3" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Sets logged</div>
          <div className="text-2xl font-medium tabular-nums text-app">{totalSets}</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Exercises</div>
          <div className="text-2xl font-medium tabular-nums text-app">{exercisesTrained}</div>
        </div>
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>PERSONAL RECORDS</div>

      {totalSets === 0 ? (
        <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
          Log your first session to see PRs here.
        </div>
      ) : (
        <div className="space-y-2">
          {allExercises.map(ex => {
            const pr = findPR(ex.id);
            if (!pr) return null;
            const sessions = (history[ex.id] || []).length;
            return (
              <div key={ex.id} className="border rounded-lg p-3"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium leading-tight text-app">{ex.name}</div>
                  <Trophy size={14} style={{ color: 'var(--accent-amber)' }} className="shrink-0" />
                </div>
                <div className="flex items-baseline gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium tabular-nums text-app">{pr.weight}{ex.weightUnit !== 'level' ? ` ${ex.weightUnit}` : ''}</span>
                  <span>×</span>
                  <span className="font-medium tabular-nums text-app">{pr.reps}</span>
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
