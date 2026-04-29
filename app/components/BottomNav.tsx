'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, Calendar, BarChart3, Settings, Target } from 'lucide-react';

const TABS = [
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/calendar', label: 'Plan', icon: Calendar },
  { href: '/catches', label: 'Catches', icon: Target },
  { href: '/history', label: 'PRs', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 backdrop-blur nav-bg border-t border-app bottom-nav z-20">
      <div className="max-w-md mx-auto grid grid-cols-5 pt-2">
        {TABS.map(t => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 py-1"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              <Icon size={20} />
              <span className="text-[10px]">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
