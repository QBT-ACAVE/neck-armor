'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/nutrition');
  }, [router]);
  return <div className="p-8 text-center text-zinc-400">Loading…</div>;
}
