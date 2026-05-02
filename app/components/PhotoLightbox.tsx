'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function PhotoLightbox({
  src, alt, onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col p-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}
      onClick={handleClose}
    >
      <div className="flex justify-end mb-3 shrink-0">
        <button
          onClick={handleClose}
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
          onClick={handleClose}
          className="max-w-full max-h-full object-contain rounded-lg cursor-zoom-out"
        />
      </div>
    </div>,
    document.body,
  );
}
