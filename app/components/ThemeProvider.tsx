'use client';
import { useEffect } from 'react';

// Inline theme bootstrap script - prevents flash of wrong theme on load.
// Reads localStorage before React hydrates and sets the theme attribute.
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('neck_armor_theme') || 'system';
    var resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

export function ThemeBootstrap() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}

// Listen for system theme changes when in 'system' mode
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = localStorage.getItem('neck_armor_theme') || 'system';
      if (t !== 'system') return;
      const resolved = mq.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    };
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return <>{children}</>;
}

export type Theme = 'light' | 'dark' | 'system';

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('neck_armor_theme') as Theme) || 'system';
}

export function setTheme(t: Theme) {
  localStorage.setItem('neck_armor_theme', t);
  const resolved = t === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}
