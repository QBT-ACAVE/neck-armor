'use client';
import { useEffect, useRef, useState } from 'react';
import { X, SkipForward } from 'lucide-react';
import { loadSettings } from '@/lib/storage';

export default function RestTimer({ duration, onComplete, onSkip }: { duration: number; onComplete: () => void; onSkip: () => void }) {
  const [remaining, setRemaining] = useState(duration);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (remaining <= 0) {
      const settings = loadSettings();
      // Beep
      if (settings.restTimerSound && typeof window !== 'undefined') {
        try {
          const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          [0, 200, 400].forEach(delay => {
            setTimeout(() => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.frequency.value = 880;
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
              osc.connect(gain).connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.15);
            }, delay);
          });
        } catch {}
      }
      // Haptic
      if (settings.restTimerHaptic && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 200]);
      }
      onComplete();
      return;
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onComplete]);

  const pct = ((duration - remaining) / duration) * 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
      <div className="bg-zinc-900 text-white rounded-xl shadow-2xl p-4 timer-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-zinc-400">Rest</div>
          <button onClick={onSkip} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
            Skip <SkipForward size={12} />
          </button>
        </div>
        <div className="flex items-baseline justify-center gap-1 mb-3">
          <span className="text-5xl font-light tabular-nums">{mins}:{String(secs).padStart(2, '0')}</span>
        </div>
        <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
