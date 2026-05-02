'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadSettings, saveSettings, type Settings } from '@/lib/storage';
import { PROGRAM_META } from '@/lib/program';
import { supabase } from '@/lib/supabase';
import { getTheme, setTheme as applyTheme, type Theme } from '../components/ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';

export default function SettingsPage() {
  const [s, setS] = useState<Settings>({ restTimerSound: true, restTimerHaptic: true, pushNotifications: false, autoProgression: true });
  const [notifStatus, setNotifStatus] = useState<string>('');
  const [theme, setThemeState] = useState<Theme>('system');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setS(loadSettings());
    setNotifStatus(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    setThemeState(getTheme());
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next); saveSettings(next);
  };

  const updateTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  };

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('Notifications not supported. Add app to home screen first.');
      return;
    }
    const result = await Notification.requestPermission();
    setNotifStatus(result);
    if (result === 'granted') {
      update({ pushNotifications: true });
      new Notification('Reid Cave', { body: 'Notifications enabled!' });
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const [{ data: state }, { data: nutrition }] = await Promise.all([
        supabase().from('app_state').select('*'),
        supabase().from('nutrition_log').select('*'),
      ]);
      const data = {
        app_state: state ?? [],
        nutrition_log: nutrition ?? [],
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `neck-armor-${Date.now()}.json`;
      a.click();
    } catch (e) {
      alert('Export failed: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const wipeAll = async () => {
    if (!confirm('Erase ALL data (workouts, catches, nutrition, PRs)? This cannot be undone.')) return;
    setBusy(true);
    try {
      await Promise.all([
        supabase().from('app_state').delete().neq('key', ''),
        supabase().from('nutrition_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);
      // Clear local cache
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('neck_armor_')) localStorage.removeItem(k);
      }
      location.reload();
    } catch (e) {
      alert('Wipe failed: ' + (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-medium mb-4 text-app">Settings</h1>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>APPEARANCE</div>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { id: 'light' as Theme, label: 'Light', icon: Sun },
          { id: 'dark' as Theme, label: 'Dark', icon: Moon },
          { id: 'system' as Theme, label: 'System', icon: Monitor },
        ].map(opt => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button key={opt.id} onClick={() => updateTheme(opt.id)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors"
              style={{
                background: active ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderColor: active ? 'var(--text-primary)' : 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}>
              <Icon size={18} />
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>WORKOUT</div>
      <div className="space-y-1 mb-6">
        <Toggle label="Rest timer sound" value={s.restTimerSound} onChange={v => update({ restTimerSound: v })} />
        <Toggle label="Haptic feedback" value={s.restTimerHaptic} onChange={v => update({ restTimerHaptic: v })} />
        <Toggle label="Auto weight progression" value={s.autoProgression} onChange={v => update({ autoProgression: v })} />
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>NOTIFICATIONS</div>
      <div className="rounded-lg p-3 mb-6 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="text-sm font-medium mb-1 text-app">Daily training reminders</div>
        <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Status: {notifStatus}</div>
        {notifStatus !== 'granted' && (
          <button onClick={requestPushPermission} className="w-full py-2 text-sm rounded-md font-medium"
            style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
            Enable notifications
          </button>
        )}
        {notifStatus === 'granted' && (
          <div className="text-xs" style={{ color: 'var(--accent-emerald)' }}>✓ Enabled</div>
        )}
        <div className="text-[10px] mt-2" style={{ color: 'var(--text-tertiary)' }}>Tip: For best results, add to home screen first (Share → Add to Home Screen).</div>
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>MEDICINE</div>
      <div className="space-y-2 mb-6">
        <Link href="/settings/manage-meds"
          className="block w-full py-2.5 px-3 text-sm rounded-md font-medium border text-left"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
          Manage Medicines
        </Link>
        <Link href="/settings/recipients"
          className="block w-full py-2.5 px-3 text-sm rounded-md font-medium border text-left"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
          Notification Recipients
        </Link>
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>DATA</div>
      <div className="space-y-2 mb-6">
        <button onClick={exportData} disabled={busy} className="w-full py-2.5 text-sm rounded-md font-medium border disabled:opacity-50"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
          {busy ? 'Working…' : 'Export all data'}
        </button>
        <button onClick={wipeAll} disabled={busy} className="w-full py-2.5 text-sm rounded-md font-medium border disabled:opacity-50"
          style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red-border)', color: 'var(--accent-red)' }}>
          Erase all data
        </button>
        <div className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Synced to cloud · accessible from any device
        </div>
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>HOW TO RATE A SET</div>
      <div className="rounded-lg p-3 mb-6 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          Tap the emoji column after each set. The app uses your ratings to suggest weights.
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2"><span className="text-base">😌</span> <span className="text-app">Easy</span> <span style={{ color: 'var(--text-tertiary)' }}>· could've done a lot more</span></div>
          <div className="flex items-center gap-2"><span className="text-base">💪</span> <span className="text-app">Just right</span> <span style={{ color: 'var(--text-tertiary)' }}>· challenged but completed</span></div>
          <div className="flex items-center gap-2"><span className="text-base">🥵</span> <span className="text-app">Hard</span> <span style={{ color: 'var(--text-tertiary)' }}>· barely got through</span></div>
          <div className="flex items-center gap-2"><span className="text-base">❌</span> <span className="text-app">Failed</span> <span style={{ color: 'var(--text-tertiary)' }}>· couldn't finish reps</span></div>
        </div>
      </div>

      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>ABOUT</div>
      <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
        <div><strong style={{ color: 'var(--text-primary)' }}>{PROGRAM_META.name}</strong> · {PROGRAM_META.subtitle}</div>
        <div>{PROGRAM_META.totalSessions} total sessions · 4 days/week</div>
        <div className="pt-1" style={{ color: 'var(--text-tertiary)' }}>v2.0.0 · cloud sync</div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <span className="text-sm text-app">{label}</span>
      <button onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full relative transition-colors"
        style={{ background: value ? 'var(--accent-emerald)' : 'var(--border-secondary)' }}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
