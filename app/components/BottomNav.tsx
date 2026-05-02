'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, Calendar, Settings, Target, Beef, Pill } from 'lucide-react';
import { fetchScheduledDosesForDate, localDateKey, combineDateAndTime } from '@/lib/meds';

const TABS = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/nutrition', label: 'Fuel', icon: Beef },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/meds', label: 'Meds', icon: Pill },
  { href: '/calendar', label: 'Plan', icon: Calendar },
  { href: '/catches', label: 'Catches', icon: Target },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const RECHECK_MS = 60_000;

export default function BottomNav() {
  const pathname = usePathname();
  const [medsAlert, setMedsAlert] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const items = await fetchScheduledDosesForDate(localDateKey());
        const now = new Date();
        const hasOverdue = items.some(s =>
          !s.taken_at && now >= combineDateAndTime(now, s.dose.time_of_day));
        if (alive) setMedsAlert(hasOverdue);
      } catch { /* ignore — nav badge is best-effort */ }
    };
    check();
    const id = setInterval(check, RECHECK_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 backdrop-blur nav-bg border-t border-app bottom-nav z-20">
      <div className="max-w-md mx-auto grid grid-cols-7 pt-2">
        {TABS.map(t => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          const Icon = t.icon;
          const showDot = t.href === '/meds' && medsAlert;
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 py-1 relative"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              <div className="relative">
                <Icon size={20} />
                {showDot && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full"
                    style={{ background: 'var(--accent-red, #ef4444)' }} />
                )}
              </div>
              <span className="text-[10px]">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
