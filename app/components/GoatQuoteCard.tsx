'use client';
import { useEffect, useState } from 'react';
import { randomQuote, type GoatQuote } from '@/lib/goat-quotes';
import { RefreshCw } from 'lucide-react';

export default function GoatQuoteCard() {
  const [quote, setQuote] = useState<GoatQuote | null>(null);

  useEffect(() => {
    setQuote(randomQuote());
  }, []);

  const cycle = () => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    let next = randomQuote();
    if (quote) {
      let guard = 0;
      while (next.text === quote.text && guard < 10) {
        next = randomQuote();
        guard++;
      }
    }
    setQuote(next);
  };

  if (!quote) {
    return <div className="px-1 py-4 mb-4" style={{ minHeight: 110 }} />;
  }

  return (
    <div className="px-1 py-2 mb-5 relative select-none">
      {/* Tiny header */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="text-[12px] font-bold tracking-[0.18em]"
          style={{ color: '#dc2626' }}
        >
          QUOTES FROM THE G.O.A.T.S
        </div>
        <button
          onClick={cycle}
          className="p-1 rounded-md transition active:scale-90"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Next quote"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Editorial pull-quote */}
      <p
        className="text-[22px] leading-[1.25] font-bold tracking-tight text-app"
        style={{ color: 'var(--text-primary)' }}
      >
        &ldquo;{quote.text}&rdquo;
      </p>

      {/* Attribution right-aligned */}
      <div className="mt-3 flex items-baseline justify-end gap-2">
        <span
          className="text-[10px] tracking-[0.22em] uppercase"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {quote.topic}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>·</span>
        <span
          className="text-[13px] font-semibold"
          style={{ color: '#dc2626' }}
        >
          — {quote.author}
        </span>
      </div>
    </div>
  );
}
