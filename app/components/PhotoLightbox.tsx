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
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 p-2 bg-black/60 rounded-full text-white"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt ?? ''}
        onClick={onClose}
        className="max-w-full max-h-full object-contain rounded-lg cursor-zoom-out"
      />
    </div>
  );
}
