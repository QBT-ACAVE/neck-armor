import webpush from 'web-push';

let configured = false;

function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushSendResult = { success: true } | { success: false; expired: boolean; error: string };

export async function sendPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<PushSendResult> {
  if (!configure()) return { success: false, expired: false, error: 'VAPID env missing' };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 30 }
    );
    return { success: true };
  } catch (e: unknown) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const expired = err.statusCode === 404 || err.statusCode === 410;
    return { success: false, expired, error: err.message || String(e) };
  }
}
