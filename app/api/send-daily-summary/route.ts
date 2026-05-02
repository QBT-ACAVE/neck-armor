import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDoseScheduledOn } from '@/lib/cadence';
import { sendSms } from '@/lib/twilio';
import type {
  Medicine, MedicineDose, MedicineIntakeLog, NotificationRecipient,
} from '@/lib/meds-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TZ = 'America/Denver';

function getDenverDateKey(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now);
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

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  const forDate = getDenverDateKey();

  if (!force) {
    const existing = await supabase.from('notification_send_log')
      .select('id').eq('for_date', forDate).limit(1);
    if (!existing.error && existing.data && existing.data.length > 0) {
      return NextResponse.json({ skipped: true, reason: 'already sent for ' + forDate });
    }
  }

  const [medsRes, dosesRes, logsRes, recipientsRes] = await Promise.all([
    supabase.from('medicines').select('*').eq('active', true),
    supabase.from('medicine_doses').select('*'),
    supabase.from('medicine_intake_log').select('*').eq('scheduled_date', forDate),
    supabase.from('notification_recipients').select('*').eq('active', true),
  ]);
  if (medsRes.error) return NextResponse.json({ error: medsRes.error.message }, { status: 500 });
  if (dosesRes.error) return NextResponse.json({ error: dosesRes.error.message }, { status: 500 });
  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
  if (recipientsRes.error) return NextResponse.json({ error: recipientsRes.error.message }, { status: 500 });

  const medicines = (medsRes.data ?? []) as Medicine[];
  const doses = (dosesRes.data ?? []) as MedicineDose[];
  const logs = (logsRes.data ?? []) as MedicineIntakeLog[];
  const recipients = (recipientsRes.data ?? []) as NotificationRecipient[];
  const medById = new Map(medicines.map(m => [m.id, m]));

  const date = parseDateKey(forDate);
  const items: { name: string; time: string; taken: boolean }[] = [];
  for (const dose of doses) {
    const med = medById.get(dose.medicine_id);
    if (!med) continue;
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    const taken = logs.some(l => l.dose_id === dose.id);
    items.push({ name: med.name, time: dose.time_of_day.slice(0, 5), taken });
  }
  items.sort((a, b) => a.time.localeCompare(b.time));

  const total = items.length;
  const takenCount = items.filter(i => i.taken).length;

  const dayLabel = new Date(forDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const lines: string[] = [`Reid's meds — ${dayLabel}`];
  for (const it of items) {
    const mark = it.taken ? '✓' : '⚠';
    const suffix = it.taken ? '' : ' — MISSED';
    lines.push(`${mark} ${it.name} (${formatTime(it.time)})${suffix}`);
  }
  if (total === 0) {
    lines.push('No doses scheduled.');
  } else {
    const tail = takenCount === total
      ? `${takenCount}/${total} ✓ — keep streak alive`
      : `${takenCount}/${total} — streak broken`;
    lines.push(tail);
  }
  const body = lines.join('\n');

  const sends = await Promise.all(
    recipients.filter(r => r.phone).map(async r => {
      const result = await sendSms(r.phone!, body);
      try {
        await supabase.from('notification_send_log').insert({
          for_date: forDate,
          recipient_id: r.id,
          channel: 'sms',
          status: result.success ? 'sent' : 'failed',
          error: result.error ?? null,
          provider_message_id: result.providerMessageId ?? null,
        });
      } catch (e) {
        console.error('notification_send_log insert failed', e);
      }
      return { recipient: r.name, ...result };
    })
  );

  if (recipients.filter(r => r.phone).length === 0) {
    await supabase.from('notification_send_log').insert({
      for_date: forDate, channel: 'sms', status: 'sent',
      error: 'no recipients with phones — no-op',
    });
  }

  return NextResponse.json({ for_date: forDate, total, taken: takenCount, sends });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const fakeReq = new Request(req.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return POST(fakeReq);
}
