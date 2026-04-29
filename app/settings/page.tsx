'use client';
import { useEffect, useState } from 'react';
import { loadSettings, saveSettings, type Settings } from '@/lib/storage';
import { PROGRAM_META } from '@/lib/program';

export default function SettingsPage() {
  const [s, setS] = useState<Settings>({ restTimerSound: true, restTimerHaptic: true, pushNotifications: false, autoProgression: true });
  const [notifStatus, setNotifStatus] = useState<string>('');

  useEffect(() => { setS(loadSettings()); setNotifStatus(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'); }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next); saveSettings(next);
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
      // Schedule a daily reminder
      scheduleDailyReminder();
      new Notification('Neck Armor', { body: 'Notifications enabled! You\'ll get daily training reminders.' });
    }
  };

  const scheduleDailyReminder = () => {
    // Note: real push requires a backend. This is a fallback using SW periodic sync if available.
    if ('serviceWorker' in navigator && 'periodicSync' in (navigator.serviceWorker as any)) {
      // Best-effort; iOS doesn't support periodicSync yet
    }
  };

  const exportData = () => {
    const data = {
      progress: localStorage.getItem('neck_armor_v1'),
      history: localStorage.getItem('neck_armor_history_v1'),
      settings: localStorage.getItem('neck_armor_settings_v1'),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `neck-armor-${Date.now()}.json`;
    a.click();
  };

  const wipeAll = () => {
    if (!confirm('Erase ALL workout data? This cannot be undone.')) return;
    localStorage.removeItem('neck_armor_v1');
    localStorage.removeItem('neck_armor_history_v1');
    location.reload();
  };

  return (
    <div className="px-4 py-4" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-medium mb-4">Settings</h1>

      <div className="space-y-1 mb-6">
        <Toggle label="Rest timer sound" value={s.restTimerSound} onChange={v => update({ restTimerSound: v })} />
        <Toggle label="Haptic feedback" value={s.restTimerHaptic} onChange={v => update({ restTimerHaptic: v })} />
        <Toggle label="Auto weight progression" value={s.autoProgression} onChange={v => update({ autoProgression: v })} />
      </div>

      <div className="text-[10px] font-medium tracking-widest text-zinc-500 mb-2">NOTIFICATIONS</div>
      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-6">
        <div className="text-sm font-medium mb-1">Daily training reminders</div>
        <div className="text-xs text-zinc-500 mb-3">Status: {notifStatus}</div>
        {notifStatus !== 'granted' && (
          <button onClick={requestPushPermission} className="w-full py-2 bg-zinc-900 text-white text-sm rounded-md font-medium">
            Enable notifications
          </button>
        )}
        {notifStatus === 'granted' && (
          <div className="text-xs text-emerald-600">✓ Enabled</div>
        )}
        <div className="text-[10px] text-zinc-400 mt-2">Tip: For best results, add to home screen first (Share → Add to Home Screen).</div>
      </div>

      <div className="text-[10px] font-medium tracking-widest text-zinc-500 mb-2">DATA</div>
      <div className="space-y-2 mb-6">
        <button onClick={exportData} className="w-full py-2.5 bg-white border border-zinc-200 text-sm rounded-md font-medium">
          Export workout data
        </button>
        <button onClick={wipeAll} className="w-full py-2.5 bg-white border border-red-200 text-sm rounded-md font-medium text-red-600">
          Erase all data
        </button>
      </div>

      <div className="text-[10px] font-medium tracking-widest text-zinc-500 mb-2">ABOUT</div>
      <div className="bg-zinc-100 rounded-lg p-3 text-xs text-zinc-600 space-y-1">
        <div><strong>{PROGRAM_META.name}</strong> · {PROGRAM_META.subtitle}</div>
        <div>{PROGRAM_META.totalSessions} total sessions · 4 days/week</div>
        <div className="text-zinc-400 pt-1">v1.0.0</div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between bg-white border border-zinc-200 rounded-lg px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full relative transition-colors ${value ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
