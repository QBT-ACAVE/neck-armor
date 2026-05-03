// app/meds/components/MedCard.tsx
'use client';
import { useState } from 'react';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import { combineDateAndTime, getSignedImageUrl } from '@/lib/meds';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { formatTime } from '../format';
import PhotoLightbox from '@/app/components/PhotoLightbox';

export default function MedCard({
  item,
  imageUrl,
  onToggle,
}: {
  item: ScheduledDoseToday;
  imageUrl: string | null;
  onToggle: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const lightboxOpen = lightboxUrl !== null;

  const taken = item.taken_at !== null;
  const now = new Date();
  const due = combineDateAndTime(now, item.dose.time_of_day);
  const past = now >= due;
  const overdue = past && !taken;

  const handleCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    if (navigator.vibrate) navigator.vibrate(10);
    try { await onToggle(); } finally { setPending(false); }
  };

  const openLightbox = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.medicine.image_path) return;
    try {
      const url = await getSignedImageUrl(item.medicine.image_path);
      setLightboxUrl(url);
    } catch {
      if (imageUrl) setLightboxUrl(imageUrl);
    }
  };

  const bg = taken ? 'var(--accent-emerald-tint)' : 'var(--bg-secondary)';
  const border = taken ? 'var(--accent-emerald-border)' : 'var(--border-primary)';

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      className="relative rounded-xl border p-3 mb-2 transition-colors cursor-pointer active:scale-[0.99]"
      style={{ background: bg, borderColor: border }}
    >
      {overdue && (
        <div
          className="absolute top-1.5 right-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border pointer-events-none"
          style={{
            background: 'var(--accent-red-bg)',
            color: 'var(--accent-red)',
            borderColor: 'var(--accent-red-border)',
          }}
        >
          Overdue
        </div>
      )}
      <div className="flex items-center gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            onClick={openLightbox}
            className="w-14 h-20 rounded-lg object-contain bg-white/5 cursor-zoom-in shrink-0"
          />
        ) : (
          <div className="w-14 h-20 rounded-lg flex items-center justify-center text-xl shrink-0"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>💊</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-app truncate">{item.medicine.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(item.dose.time_of_day)}
            {item.dose.label ? ` · ${item.dose.label}` : ''}
          </div>
        </div>
        <button
          onClick={handleCheck}
          disabled={pending}
          aria-label={taken ? 'Undo' : 'Mark taken'}
          className="w-10 h-10 rounded-lg border flex items-center justify-center transition"
          style={{
            background: taken ? 'var(--accent-emerald)' : 'transparent',
            borderColor: taken ? 'var(--accent-emerald)' : 'var(--border-secondary)',
          }}
        >
          {taken && <Check size={20} color="white" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t text-xs space-y-1.5"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          {item.medicine.purpose && <div><strong style={{ color: 'var(--text-primary)' }}>For:</strong> {item.medicine.purpose}</div>}
          {item.medicine.instructions && <div><strong style={{ color: 'var(--text-primary)' }}>How:</strong> {item.medicine.instructions}</div>}
          {!item.medicine.purpose && !item.medicine.instructions && (
            <div style={{ color: 'var(--text-tertiary)' }}>No notes yet.</div>
          )}
          <div className="pt-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>tap to collapse</span>
          </div>
        </div>
      )}
      {lightboxOpen && lightboxUrl && (
        <PhotoLightbox
          src={lightboxUrl}
          alt={item.medicine.name}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
}
