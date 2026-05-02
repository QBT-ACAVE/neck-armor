'use client';
import { useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import type { Medicine, MedicineIntakeLog } from '@/lib/meds-types';
import { getSignedImageUrl } from '@/lib/meds';
import PhotoLightbox from '@/app/components/PhotoLightbox';

export default function PrnCard({
  medicine,
  imageUrl,
  intakesToday,
  onTake,
}: {
  medicine: Medicine;
  imageUrl: string | null;
  intakesToday: MedicineIntakeLog[];
  onTake: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const lightboxOpen = lightboxUrl !== null;

  const count = intakesToday.length;
  const last = count > 0
    ? [...intakesToday].sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0]
    : null;

  const handleTake = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    if (navigator.vibrate) navigator.vibrate(10);
    try { await onTake(); } finally { setPending(false); }
  };

  const openLightbox = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!medicine.image_path) return;
    try {
      const url = await getSignedImageUrl(medicine.image_path);
      setLightboxUrl(url);
    } catch {
      if (imageUrl) setLightboxUrl(imageUrl);
    }
  };

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      className="rounded-xl border p-3 mb-2 transition-colors cursor-pointer active:scale-[0.99]"
      style={{
        background: count > 0 ? 'var(--accent-emerald-tint)' : 'var(--bg-secondary)',
        borderColor: count > 0 ? 'var(--accent-emerald-border)' : 'var(--border-primary)',
      }}
    >
      <div className="flex items-center gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            onClick={openLightbox}
            className="w-14 h-14 rounded-lg object-contain bg-white/5 cursor-zoom-in"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg flex items-center justify-center text-xl"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>💊</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-app truncate">{medicine.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {count === 0
              ? 'Not taken today'
              : `Taken ${count}× today${last ? ' · last ' + new Date(last.taken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}`}
          </div>
        </div>
        <button
          onClick={handleTake}
          disabled={pending}
          aria-label="Took it"
          className="px-3 h-10 rounded-lg border flex items-center gap-1 text-sm font-medium transition"
          style={{
            background: 'var(--accent-emerald)',
            borderColor: 'var(--accent-emerald)',
            color: 'white',
          }}
        >
          <Plus size={16} /> Took it
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t text-xs space-y-1.5"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          {medicine.purpose && <div><strong style={{ color: 'var(--text-primary)' }}>For:</strong> {medicine.purpose}</div>}
          {medicine.instructions && <div><strong style={{ color: 'var(--text-primary)' }}>How:</strong> {medicine.instructions}</div>}
          {!medicine.purpose && !medicine.instructions && (
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
          alt={medicine.name}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
}
