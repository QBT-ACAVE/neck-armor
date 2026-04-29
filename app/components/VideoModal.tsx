'use client';
import { X } from 'lucide-react';

export default function VideoModal({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md aspect-video bg-black rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 z-10 p-2 bg-black/50 rounded-full text-white">
          <X size={18} />
        </button>
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title="Exercise demo"
          allow="accelerometer; autoplay; encrypted-media; gyroscope"
          allowFullScreen
        />
      </div>
    </div>
  );
}
