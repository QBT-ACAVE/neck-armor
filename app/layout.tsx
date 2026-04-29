import './globals.css';
import type { Metadata, Viewport } from 'next';
import BottomNav from './components/BottomNav';
import SWRegister from './components/SWRegister';

export const metadata: Metadata = {
  title: 'Neck Armor',
  description: '12-week neck strength program',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Neck Armor' },
  icons: { apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#fafafa',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen">
        <main className="pb-20 max-w-md mx-auto">{children}</main>
        <BottomNav />
        <SWRegister />
      </body>
    </html>
  );
}
