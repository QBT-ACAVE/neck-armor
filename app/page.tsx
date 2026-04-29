'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadProgress } from '@/lib/storage';
import { SCHEDULE, sessionKey } from '@/lib/program';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const p = loadProgress();
    // Find first incomplete session
    let targetIdx = 0;
    for (let i = 0; i < SCHEDULE.length; i++) {
      const s = SCHEDULE[i];
      const k = sessionKey(s.week, s.day);
      const sp = p[k] || {};
      const totalSets = s.exercises.reduce((sum, e) => sum + e.sets, 0);
      const doneSets = Object.values(sp).filter(v => v?.done).length;
      if (doneSets < totalSets) { targetIdx = i; break; }
      if (i === SCHEDULE.length - 1) targetIdx = i;
    }
    router.replace(`/workout?idx=${targetIdx}`);
  }, [router]);
  return <div className="p-8 text-center text-zinc-400">Loading…</div>;
}
