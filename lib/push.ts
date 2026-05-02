'use client';
import { supabase } from './supabase';

export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof window === 'undefined') return { ok: false, reason: 'no window' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'service worker unsupported' };
  if (!('PushManager' in window)) return { ok: false, reason: 'push not supported (try after Add to Home Screen)' };

  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: `permission ${perm}` };

  const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPub) return { ok: false, reason: 'VAPID public key not configured' };

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPub) as unknown as ArrayBuffer,
  });
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { ok: false, reason: 'subscription missing keys' };

  const { error } = await supabase().from('push_subscriptions').upsert(
    { endpoint, p256dh, auth, user_label: navigator.userAgent.slice(0, 60), active: true },
    { onConflict: 'endpoint' }
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase().from('push_subscriptions').update({ active: false }).eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function getSubscriptionStatus(): Promise<'subscribed' | 'unsubscribed' | 'unsupported' | 'denied'> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
