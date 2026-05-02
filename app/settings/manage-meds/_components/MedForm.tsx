'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus, Camera } from 'lucide-react';
import {
  createMedicine, updateMedicine, upsertDoses, deleteMedicine,
  uploadMedicineImage, deleteMedicineImage, getSignedImageUrl,
} from '@/lib/meds';
import type { Medicine, MedicineDose } from '@/lib/meds-types';
import type { CadenceKind } from '@/lib/cadence';

export type DoseDraft = {
  id?: string;
  time_of_day: string;          // 'HH:MM'
  cadence: CadenceKind;
  days_of_week: number[];
  interval_days: number;
  start_date: string;           // 'YYYY-MM-DD'
  label: string;
};

const emptyDose = (): DoseDraft => ({
  time_of_day: '08:00',
  cadence: 'daily',
  days_of_week: [],
  interval_days: 1,
  start_date: new Date().toISOString().slice(0, 10),
  label: '',
});

export default function MedForm({
  medicine,
  doses,
}: {
  medicine?: Medicine;
  doses?: MedicineDose[];
}) {
  const router = useRouter();
  const isEdit = !!medicine;
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(medicine?.name ?? '');
  const [purpose, setPurpose] = useState(medicine?.purpose ?? '');
  const [instructions, setInstructions] = useState(medicine?.instructions ?? '');
  const [active, setActive] = useState(medicine?.active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(medicine?.image_path ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [doseDrafts, setDoseDrafts] = useState<DoseDraft[]>(
    doses && doses.length > 0
      ? doses.map(d => ({
          id: d.id,
          time_of_day: d.time_of_day.slice(0, 5),
          cadence: d.cadence,
          days_of_week: d.days_of_week ?? [],
          interval_days: d.interval_days ?? 1,
          start_date: d.start_date ?? new Date().toISOString().slice(0, 10),
          label: d.label ?? '',
        }))
      : [emptyDose()]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (imagePath) getSignedImageUrl(imagePath).then(setImageUrl).catch(() => setImageUrl(null));
    else setImageUrl(null);
  }, [imagePath]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image too large (>5MB).'); return; }
    setBusy(true); setError(null);
    try {
      const newPath = await uploadMedicineImage(f);
      if (imagePath) await deleteMedicineImage(imagePath);
      setImagePath(newPath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const updateDose = (idx: number, patch: Partial<DoseDraft>) => {
    setDoseDrafts(arr => arr.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };
  const removeDose = (idx: number) => setDoseDrafts(arr => arr.filter((_, i) => i !== idx));
  const addDose = () => setDoseDrafts(arr => [...arr, emptyDose()]);

  const onSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (doseDrafts.length === 0) { setError('Add at least one dose.'); return; }
    for (const d of doseDrafts) {
      if (d.cadence === 'custom_days' && d.days_of_week.length === 0) {
        setError('Pick at least one day for "Specific days" doses.'); return;
      }
      if (d.cadence === 'every_n_days' && (!d.interval_days || d.interval_days < 1)) {
        setError('Interval must be at least 1 day.'); return;
      }
    }
    setBusy(true); setError(null);
    try {
      const medRow = {
        name: name.trim(),
        purpose: purpose.trim() || null,
        instructions: instructions.trim() || null,
        active,
        image_path: imagePath,
      };
      let medId = medicine?.id;
      if (isEdit) {
        await updateMedicine(medicine!.id, medRow);
      } else {
        const created = await createMedicine(medRow);
        medId = created.id;
      }
      const cleanedDoses = doseDrafts.map(d => ({
        id: d.id,
        time_of_day: d.time_of_day,
        cadence: d.cadence,
        days_of_week: d.cadence === 'weekdays' ? [1, 2, 3, 4, 5]
          : d.cadence === 'custom_days' ? d.days_of_week
          : null,
        interval_days: d.cadence === 'every_n_days' ? d.interval_days : null,
        start_date: d.cadence === 'every_n_days' ? d.start_date : null,
        label: d.label.trim() || null,
      }));
      await upsertDoses(medId!, cleanedDoses as any);
      router.push('/settings/manage-meds');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!medicine) return;
    if (!confirm(`Delete "${medicine.name}"? All intake history for this medicine will also be erased. This cannot be undone.`)) return;
    setBusy(true);
    try {
      if (medicine.image_path) await deleteMedicineImage(medicine.image_path);
      await deleteMedicine(medicine.id);
      router.push('/settings/manage-meds');
    } catch (err) {
      setError((err as Error).message); setBusy(false);
    }
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-semibold mb-4 text-app">{isEdit ? 'Edit medicine' : 'Add medicine'}</h1>

      {/* Photo */}
      <div className="mb-5 flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--bg-tertiary)' }}>
          {imageUrl
            ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            : <Camera size={28} style={{ color: 'var(--text-tertiary)' }} />}
        </div>
        <div>
          <input ref={fileInput} type="file" accept="image/*" capture="environment"
            onChange={onPickFile} className="hidden" id="med-photo" />
          <label htmlFor="med-photo"
            className="inline-block py-2 px-3 text-sm rounded-md border cursor-pointer"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
            {imagePath ? 'Replace photo' : 'Add photo'}
          </label>
          {imagePath && (
            <button type="button" onClick={() => { if (imagePath) deleteMedicineImage(imagePath); setImagePath(null); }}
              className="block text-xs mt-1.5" style={{ color: 'var(--accent-red)' }}>Remove</button>
          )}
        </div>
      </div>

      {/* Name */}
      <Field label="Name">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Terbinafine 250mg"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-app"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }} />
      </Field>

      {/* Purpose */}
      <Field label="What it's for">
        <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2}
          placeholder="Antifungal — for skin/nail fungus"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-app resize-none"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }} />
      </Field>

      {/* Instructions */}
      <Field label="How to take">
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
          placeholder="1 tablet by mouth with food"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-app resize-none"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }} />
      </Field>

      {/* Active toggle */}
      <Field label="Active">
        <button type="button" onClick={() => setActive(!active)}
          className="w-11 h-6 rounded-full relative transition-colors"
          style={{ background: active ? 'var(--accent-emerald)' : 'var(--border-secondary)' }}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </Field>

      {/* Doses */}
      <div className="text-[10px] font-medium tracking-widest mb-2 mt-4" style={{ color: 'var(--text-secondary)' }}>DOSES</div>
      {doseDrafts.map((d, i) => (
        <DoseEditor key={i} value={d}
          onChange={p => updateDose(i, p)}
          onRemove={() => removeDose(i)}
          canRemove={doseDrafts.length > 1} />
      ))}
      <button type="button" onClick={addDose}
        className="w-full py-2 mb-4 text-sm rounded-md border flex items-center justify-center gap-1"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
        <Plus size={14} /> Add dose
      </button>

      {error && <div className="text-xs mb-3" style={{ color: 'var(--accent-red)' }}>{error}</div>}

      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy}
          className="flex-1 py-2.5 rounded-md font-medium disabled:opacity-50"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {isEdit && (
          <button onClick={onDelete} disabled={busy}
            className="py-2.5 px-3 rounded-md border disabled:opacity-50"
            style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red-border)', color: 'var(--accent-red)' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-medium tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function DoseEditor({
  value, onChange, onRemove, canRemove,
}: {
  value: DoseDraft;
  onChange: (p: Partial<DoseDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-lg p-3 mb-2 border"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-2 mb-2">
        <input type="time" value={value.time_of_day}
          onChange={e => onChange({ time_of_day: e.target.value })}
          className="px-2 py-1 rounded border bg-transparent text-app"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
        <input value={value.label} onChange={e => onChange({ label: e.target.value })}
          placeholder="Label (optional)" className="flex-1 px-2 py-1 rounded border bg-transparent text-app text-sm"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ color: 'var(--accent-red)' }}><Trash2 size={14} /></button>
        )}
      </div>
      <select value={value.cadence}
        onChange={e => onChange({ cadence: e.target.value as CadenceKind })}
        className="w-full px-2 py-1.5 rounded border bg-transparent text-app text-sm mb-2"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
        <option value="daily">Every day</option>
        <option value="weekdays">Weekdays only (Mon–Fri)</option>
        <option value="custom_days">Specific days</option>
        <option value="every_n_days">Every N days</option>
      </select>
      {value.cadence === 'custom_days' && (
        <div className="flex gap-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, idx) => {
            const on = value.days_of_week.includes(idx);
            return (
              <button key={idx} type="button"
                onClick={() => onChange({
                  days_of_week: on
                    ? value.days_of_week.filter(d => d !== idx)
                    : [...value.days_of_week, idx].sort()
                })}
                className="flex-1 py-1 text-[11px] rounded border"
                style={{
                  background: on ? 'var(--accent-emerald)' : 'var(--bg-tertiary)',
                  borderColor: on ? 'var(--accent-emerald)' : 'var(--border-primary)',
                  color: on ? 'white' : 'var(--text-secondary)',
                }}>{label}</button>
            );
          })}
        </div>
      )}
      {value.cadence === 'every_n_days' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Every</span>
          <input type="number" min={1} value={value.interval_days}
            onChange={e => onChange({ interval_days: parseInt(e.target.value) || 1 })}
            className="w-16 px-2 py-1 rounded border bg-transparent text-app"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>days from</span>
          <input type="date" value={value.start_date}
            onChange={e => onChange({ start_date: e.target.value })}
            className="px-2 py-1 rounded border bg-transparent text-app"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
        </div>
      )}
    </div>
  );
}
