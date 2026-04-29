'use client';
import { useEffect } from 'react';
import { hydrateFromSupabase } from '@/lib/storage';

export default function Hydrator() {
  useEffect(() => {
    hydrateFromSupabase();
  }, []);
  return null;
}
