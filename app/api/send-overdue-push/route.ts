import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDoseScheduledOn } from '@/lib/cadence';
import { sendPush } from '@/lib/push-server';
import type { Medicine, MedicineDose, MedicineIntakeLog } from '@/lib/meds-types';
import type { PushSubscriptionRow } from '@/lib/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TZ = 'America/Chicago';

function getDenverDateAndTime(now: Date = new Date()): { dateKey: string; hhmm: string } {
  const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return { dateKey: fmtDate.format(now), hhmm: fmtTime.format(now) };
}

function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}

const GRACE_MINUTES = 5;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  const { dateKey, hhmm } = getDenverDateAndTime();
  const nowMin = hhmm2min(hhmm);

  const [medsRes, dosesRes, logsRes, sentRes, subsRes] = await Promise.all([
    supabase.from('medicines').select('*').eq('active', true),
    supabase.from('medicine_doses').select('*'),
    supabase.from('medicine_intake_log').select('dose_id').eq('scheduled_date', dateKey),
    supabase.from('push_send_log').select('dose_id, subscription_id').eq('scheduled_date', dateKey),
    supabase.from('push_subscriptions').select('*').eq('active', true),
  ]);
  for (const r of [medsRes, dosesRes, logsRes, sentRes, subsRes]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }
  const medicines = (medsRes.data ?? []) as Medicine[];
  const doses = (dosesRes.data ?? []) as MedicineDose[];
  const taken = new Set(((logsRes.data ?? []) as Pick<MedicineIntakeLog, 'dose_id'>[]).map(l => l.dose_id));
  const sentPairs = new Set((sentRes.data ?? []).map((r: { dose_id: string; subscription_id: string }) => `${r.dose_id}|${r.subscription_id}`));
  const subs = (subsRes.data ?? []) as PushSubscriptionRow[];
  const medById = new Map(medicines.map(m => [m.id, m]));

  const date = parseDateKey(dateKey);
  const overdue: { dose: MedicineDose; med: Medicine }[] = [];
  for (const dose of doses) {
    const med = medById.get(dose.medicine_id);
    if (!med) continue;
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    const doseMin = hhmm2min(dose.time_of_day.slice(0, 5));
    if (nowMin < doseMin + GRACE_MINUTES) continue;
    if (taken.has(dose.id)) continue;
    overdue.push({ dose, med });
  }

  if (overdue.length === 0 || subs.length === 0) {
    return NextResponse.json({ overdue: overdue.length, sent: 0 });
  }

  const sends: Array<{ dose_id: string; sub_id: string; ok: boolean; err?: string }> = [];
  const insertRows: Array<{ dose_id: string; scheduled_date: string; subscription_id: string; status: string; error?: string | null }> = [];
  const expireSubIds: string[] = [];

  for (const { dose, med } of overdue) {
    for (const sub of subs) {
      if (sentPairs.has(`${dose.id}|${sub.id}`)) continue;
      const result = await sendPush(sub, {
        title: `${med.name} overdue`,
        body: `Was due at ${formatTime(dose.time_of_day.slice(0, 5))}. Tap to mark taken.`,
        url: '/meds',
        tag: `meds-${dose.id}-${dateKey}`,
      });
      sends.push({ dose_id: dose.id, sub_id: sub.id, ok: result.success, err: result.success ? undefined : result.error });
      insertRows.push({
        dose_id: dose.id, scheduled_date: dateKey, subscription_id: sub.id,
        status: result.success ? 'sent' : (result.expired ? 'expired' : 'failed'),
        error: result.success ? null : result.error,
      });
      if (!result.success && result.expired) expireSubIds.push(sub.id);
    }
  }

  if (insertRows.length > 0) {
    const { error: logErr } = await supabase.from('push_send_log').insert(insertRows);
    if (logErr) {
      console.error('push_send_log insert failed:', logErr.message);
      return NextResponse.json({ error: 'log insert failed: ' + logErr.message }, { status: 500 });
    }
  }
  if (expireSubIds.length > 0) {
    const { error: expErr } = await supabase.from('push_subscriptions')
      .update({ active: false }).in('id', expireSubIds);
    if (expErr) console.error('expire subscriptions failed:', expErr.message);
  }

  return NextResponse.json({ overdue: overdue.length, sent: sends.filter(s => s.ok).length, sends });
}

function hhmm2min(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
