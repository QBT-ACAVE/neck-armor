'use client';
import { useEffect, useState } from 'react';
import { loadCatches, addCatch, deleteCatch, groupByDay, groupByMonth, getStats, type CatchEntry } from '@/lib/catches';
import { Plus, Trash2, Flame, Trophy, TrendingUp, Calendar as CalIcon } from 'lucide-react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CatchesPage() {
  const [list, setList] = useState<CatchEntry[]>([]);
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [view, setView] = useState<'recent' | 'months'>('recent');

  useEffect(() => { setList(loadCatches()); }, []);

  const submit = () => {
    const n = parseInt(count, 10);
    if (!n || n <= 0) return;
    addCatch(n, note);
    setList(loadCatches());
    setCount('');
    setNote('');
    setShowSuccess(true);
    if ('vibrate' in navigator) navigator.vibrate(50);
    setTimeout(() => setShowSuccess(false), 1200);
  };

  const remove = (id: string) => {
    if (!confirm('Delete this entry?')) return;
    deleteCatch(id);
    setList(loadCatches());
  };

  const stats = getStats(list);
  const dayBuckets = groupByDay(list);
  const monthBuckets = groupByMonth(list);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (d: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-medium mb-1 text-app">Catches</h1>
      <div className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Juggs machine reps</div>

      {/* Entry form */}
      <div className="rounded-xl p-4 mb-5 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
        <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>LOG NEW SESSION</div>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={count}
            onChange={e => setCount(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="# of catches"
            className="flex-1 h-12 px-3 text-base font-medium rounded-lg outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={submit}
            disabled={!count || parseInt(count, 10) <= 0}
            className="px-5 h-12 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}
          >
            <Plus size={16} />
            Log
          </button>
        </div>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Note (optional)"
          maxLength={80}
          className="w-full h-9 px-3 text-sm rounded-lg outline-none"
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Top stats */}
      {list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <StatCard label="Total catches" value={stats.total.toLocaleString()} accent />
            <StatCard label="This month" value={stats.monthTotal.toLocaleString()} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            <StatCard label="This week" value={stats.weekTotal.toLocaleString()} small />
            <StatCard label="Sessions" value={stats.sessions.toString()} small />
            <StatCard label="Avg/day" value={stats.avgPerDay.toString()} small />
          </div>

          {/* Streak / best day */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="rounded-lg p-3 border flex items-center gap-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <Flame size={20} style={{ color: stats.streak > 0 ? '#f97316' : 'var(--text-tertiary)' }} />
              <div>
                <div className="text-lg font-medium tabular-nums text-app">{stats.streak}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>day streak</div>
              </div>
            </div>
            <div className="rounded-lg p-3 border flex items-center gap-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <Trophy size={20} style={{ color: 'var(--accent-amber)' }} />
              <div>
                <div className="text-lg font-medium tabular-nums text-app">{stats.bestDay?.total ?? 0}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>best day</div>
              </div>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex gap-1 mb-3 p-1 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
            <button onClick={() => setView('recent')}
              className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={view === 'recent'
                ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)' }
                : { color: 'var(--text-secondary)' }}>
              Recent
            </button>
            <button onClick={() => setView('months')}
              className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={view === 'months'
                ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)' }
                : { color: 'var(--text-secondary)' }}>
              By month
            </button>
          </div>

          {view === 'recent' && (
            <div className="space-y-3">
              {dayBuckets.slice(0, 30).map(bucket => (
                <div key={bucket.dateStr}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="text-sm font-medium text-app">{formatDate(bucket.date)}</div>
                    <div className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-medium text-app">{bucket.total}</span> catches
                    </div>
                  </div>
                  <div className="space-y-1">
                    {bucket.entries.map(e => (
                      <div key={e.id} className="rounded-lg px-3 py-2 flex items-center gap-2 border"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                        <div className="text-base font-medium tabular-nums text-app w-12">{e.count}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {formatTime(e.ts)}
                            {e.note && <span className="ml-2" style={{ color: 'var(--text-tertiary)' }}>· {e.note}</span>}
                          </div>
                        </div>
                        <button onClick={() => remove(e.id)} className="p-1 -m-1" style={{ color: 'var(--text-tertiary)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'months' && (
            <div className="space-y-2">
              {monthBuckets.map(b => {
                const monthName = MONTH_NAMES[b.month];
                const avgPerDay = b.days ? Math.round(b.total / b.days) : 0;
                return (
                  <div key={b.monthStr} className="rounded-lg p-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                    <div className="flex items-baseline justify-between mb-1">
                      <div className="text-sm font-medium text-app">{monthName} {b.year}</div>
                      <div className="text-lg font-medium tabular-nums text-app">{b.total.toLocaleString()}</div>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {b.days} {b.days === 1 ? 'day' : 'days'} · {b.entries.length} {b.entries.length === 1 ? 'session' : 'sessions'} · {avgPerDay}/day avg
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {list.length === 0 && (
        <div className="text-center py-10" style={{ color: 'var(--text-tertiary)' }}>
          <CalIcon size={32} className="mx-auto mb-3 opacity-50" />
          <div className="text-sm">Log your first catch session above.</div>
        </div>
      )}

      {/* Success toast */}
      {showSuccess && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-sm font-medium pointer-events-none flex items-center gap-1.5"
          style={{ background: 'var(--accent-emerald)', color: '#ffffff' }}>
          <TrendingUp size={14} /> Logged!
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, small, accent }: { label: string; value: string; small?: boolean; accent?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{ background: accent ? 'var(--text-primary)' : 'var(--bg-tertiary)' }}>
      <div className={small ? 'text-lg' : 'text-2xl'}
        style={{
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          color: accent ? 'var(--bg-primary)' : 'var(--text-primary)',
        }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider"
        style={{ color: accent ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
