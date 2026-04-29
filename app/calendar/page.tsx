'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SCHEDULE, sessionKey, PROGRAM_META } from '@/lib/program';
import { loadProgress } from '@/lib/storage';

export default function CalendarPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<any>({});
  useEffect(() => { setProgress(loadProgress()); }, []);

  const totalAllSets = SCHEDULE.reduce((s, sess) => s + sess.exercises.reduce((a, e) => a + e.sets, 0), 0);
  const doneAllSets = Object.values(progress).reduce((s: number, sess: any) => s + Object.values(sess).filter((v: any) => v?.done).length, 0);
  const overallPct = totalAllSets ? Math.round((doneAllSets / totalAllSets) * 100) : 0;

  return (
    <div className="px-4 py-4" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-medium mb-1 text-app">12-Week Plan</h1>
      <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Overall: {overallPct}%</div>
      <div className="h-1 rounded-full overflow-hidden mb-5" style={{ background: 'var(--bg-tertiary)' }}>
        <div className="h-full" style={{ width: `${overallPct}%`, background: 'var(--accent-blue-muted)' }} />
      </div>

      {Array.from({ length: 12 }).map((_, wIdx) => {
        const wk = wIdx + 1;
        const ph = PROGRAM_META.phases.find(p => p.weeks.includes(wk))!;
        return (
          <div key={wk} className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="text-[10px] font-medium tracking-widest" style={{ color: 'var(--text-secondary)' }}>WEEK {wk}</div>
              <div className="text-[10px] tracking-wider px-1.5 py-0.5 rounded-full"
                style={{ background: `${ph.color}1f`, color: ph.color }}>{ph.name}</div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map(d => {
                const idx = wIdx * 4 + d;
                const sess = SCHEDULE[idx];
                const sk = sessionKey(sess.week, sess.day);
                const sp = progress[sk] || {};
                const totalS = sess.exercises.reduce((s, e) => s + e.sets, 0);
                const doneS = Object.values(sp).filter((v: any) => v?.done).length;
                const isDone = doneS === totalS && totalS > 0;
                return (
                  <button key={d} onClick={() => router.push(`/workout?idx=${idx}`)}
                    className="py-2.5 px-1 rounded-lg border text-xs font-medium"
                    style={{
                      background: isDone ? `${ph.color}1f` : 'var(--bg-secondary)',
                      borderColor: isDone ? ph.color : 'var(--border-primary)',
                      color: isDone ? ph.color : 'var(--text-primary)',
                    }}>
                    <div>{sess.dayName}</div>
                    <div className="text-[9px] mt-0.5 opacity-60">{isDone ? '✓ done' : `${doneS}/${totalS}`}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
