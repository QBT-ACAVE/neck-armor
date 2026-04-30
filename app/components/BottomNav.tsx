'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, Calendar, Settings, Target, Beef } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/nutrition', label: 'Fuel', icon: Beef },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/calendar', label: 'Plan', icon: Calendar },
  { href: '/catches', label: 'Catches', icon: Target },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 backdrop-blur nav-bg border-t border-app bottom-nav z-20">
      <div className="max-w-md mx-auto grid grid-cols-6 pt-2">
        {TABS.map(t => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
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
