'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { fetchRecipients, upsertRecipient, deleteRecipient } from '@/lib/meds';
import type { NotificationRecipient } from '@/lib/meds-types';

type Draft = Partial<NotificationRecipient> & { _isNew?: boolean };

export default function RecipientsPage() {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecipients().then(r => { if (!cancelled) setRows(r as Draft[]); });
    return () => { cancelled = true; };
  }, []);

  const reload = async () => {
    const fresh = await fetchRecipients() as Draft[];
    setRows(prev => {
      const drafts = (prev ?? []).filter(r => r._isNew);
      return [...fresh, ...drafts];
    });
  };

  const update = (idx: number, patch: Partial<Draft>) =>
    setRows(arr => arr!.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const addRow = () =>
    setRows(arr => [...(arr ?? []), { name: '', phone: '', active: true, _isNew: true }]);

  const save = async (idx: number) => {
    const r = rows![idx];
    if (!r.name?.trim()) { setErr('Name required.'); return; }
    if (r.phone && !/^\+\d{8,15}$/.test(r.phone)) {
      setErr('Phone must be E.164, e.g. +13035551234'); return;
    }
    setBusy(true); setErr(null);
    try {
      await upsertRecipient({
        id: r._isNew ? undefined : r.id,
        name: r.name!.trim(),
        phone: r.phone?.trim() || null,
        active: r.active ?? true,
      });
      await reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (idx: number) => {
    const r = rows![idx];
    if (r._isNew) { setRows(arr => arr!.filter((_, i) => i !== idx)); return; }
    if (!confirm(`Delete recipient "${r.name}"?`)) return;
    setBusy(true);
    try { await deleteRecipient(r.id!); await reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (rows === null) return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <Link href="/settings" className="text-xs flex items-center gap-1 mb-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={12} /> Settings
      </Link>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold text-app">Notification Recipients</h1>
        <button onClick={addRow}
          className="flex items-center gap-1 py-1.5 px-3 rounded-md text-sm font-medium"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Phone numbers in E.164 format, e.g. <code>+13035551234</code>. Only active recipients with a phone receive the 10pm SMS recap.
      </div>

      {err && <div className="text-xs mb-3" style={{ color: 'var(--accent-red)' }}>{err}</div>}

      {rows.map((r, i) => (
        <div key={r.id ?? i} className="rounded-lg p-3 mb-2 border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-2 mb-2">
            <input value={r.name ?? ''} onChange={e => update(i, { name: e.target.value })}
              placeholder="Name" className="flex-1 px-2 py-1 rounded border bg-transparent text-app text-sm"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
            <button onClick={() => remove(i)}
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ color: 'var(--accent-red)' }}><Trash2 size={14} /></button>
          </div>
          <input value={r.phone ?? ''} onChange={e => update(i, { phone: e.target.value })}
            placeholder="+13035551234" inputMode="tel"
            className="w-full px-2 py-1.5 rounded border bg-transparent text-app text-sm mb-2"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={r.active ?? true}
                onChange={e => update(i, { active: e.target.checked })} />
              Active
            </label>
            <button onClick={() => save(i)} disabled={busy}
              className="py-1 px-3 rounded text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--accent-emerald)', color: 'white' }}>
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
