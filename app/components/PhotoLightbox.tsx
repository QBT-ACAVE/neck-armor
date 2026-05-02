'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function PhotoLightbox({
  src, alt, onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}
      onClick={onClose}
    >
      <div className="flex justify-end mb-3 shrink-0">
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-3 bg-black/70 rounded-full text-white active:scale-95"
        >
          <X size={22} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        <img
          src={src}
          alt={alt ?? ''}
          onClick={onClose}
          className="max-w-full max-h-full object-contain rounded-lg cursor-zoom-out"
        />
      </div>
    </div>
  );
}
