'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, Calendar, BarChart3, Settings } from 'lucide-react';

const TABS = [
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/history', label: 'History', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-zinc-200 bottom-nav z-20">
      <div className="max-w-md mx-auto grid grid-cols-4 pt-2">
        {TABS.map(t => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 py-1 ${active ? 'text-zinc-900' : 'text-zinc-400'}`}>
              <Icon size={20} />
              <span className="text-[10px]">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
