# Medicine Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a medicine-tracking tab for the Neck Armor PWA: daily checklist with photos + instructions, in-app admin for editing meds + uploading images, history calendar, streak integration, and a 10pm SMS recap to dad/mom/Reid via Twilio + Vercel Cron.

**Architecture:** Three new Supabase tables (`medicines`, `medicine_doses`, `medicine_intake_log`) plus `notification_recipients`, `notification_send_log`, and `push_subscriptions`. Photos live in a private Supabase Storage bucket served via signed URLs. v1 includes BOTH in-app visual reminders AND real OS-level Web Push (lock-screen pop-ups). Daily SMS recap via Twilio + Vercel Cron at 10pm; per-dose overdue push via a separate Vercel Cron.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + Storage + RLS), Tailwind CSS, Lucide icons, Twilio SMS, `web-push` for VAPID server push, Vitest for unit-testing the cadence library.

**Spec:** `docs/superpowers/specs/2026-05-02-medicine-tab-design.md`

**Working directory:** `~/Downloads/neck-armor`

---

## File map

**New files:**
- `supabase/migrations/002_medicine_tables.sql` — schema + RLS policies + storage bucket
- `supabase/migrations/003_push_subscriptions.sql` — push subscription table
- `lib/meds-types.ts` — TypeScript types matching DB rows
- `lib/cadence.ts` — pure-function: "is dose D scheduled on date X?"
- `lib/cadence.test.ts` — Vitest unit tests
- `lib/meds.ts` — Supabase queries for daily list, history, intake logs
- `lib/twilio.ts` — server-only thin SMS-send wrapper
- `lib/push.ts` — client-side push subscription helper
- `lib/push-server.ts` — server-only `web-push` wrapper
- `app/meds/page.tsx` — daily checklist (the new tab)
- `app/meds/components/MedCard.tsx` — single med card UI
- `app/meds/components/OverdueBanner.tsx` — sticky banner
- `app/history/meds/page.tsx` — calendar grid + day detail
- `app/settings/manage-meds/page.tsx` — admin list
- `app/settings/manage-meds/[id]/page.tsx` — add/edit form
- `app/settings/manage-meds/new/page.tsx` — new med form (mirrors edit)
- `app/settings/recipients/page.tsx` — SMS recipients admin
- `app/api/send-daily-summary/route.ts` — cron-triggered SMS sender
- `app/api/send-overdue-push/route.ts` — cron-triggered overdue-dose push sender
- `app/api/push-subscribe/route.ts` — accept push subscription from client
- `vitest.config.ts` — test config
- `vercel.json` — cron entries (daily SMS + overdue push)

**Modified files:**
- `package.json` — add `twilio`, `web-push`, `@types/web-push`, `vitest`, `@vitest/ui` deps; add `test` script
- `app/components/BottomNav.tsx` — add Meds tab + red-dot logic
- `app/page.tsx` — add Meds streak card
- `app/settings/page.tsx` — add "Manage Medicines" + "Notification Recipients" links + last-summary status + manual resend + push subscription button (replaces existing local-Notification flow); extend `wipeAll` to clear new tables
- `public/sw.js` — add `push` and `notificationclick` handlers

---

## Pre-flight: install dev environment

Before Task 1, ensure local dev env works.

- [ ] **Step 0.1: Install deps and run dev server**

```bash
cd ~/Downloads/neck-armor
npm install
cp .env.local.example .env.local 2>/dev/null || true   # may not exist; check
# Verify NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local
npm run dev
```

Expected: dev server starts on http://localhost:3000. Open in browser, see Reid Cave home screen.

If `.env.local` is missing, get values from existing Vercel project (the app already runs in production). Stop and ask Aaron if you can't find them.

- [ ] **Step 0.2: Stop dev server (Ctrl-C) and continue with the plan**

---

## Task 1: Database migration + Storage bucket

**Files:**
- Create: `supabase/migrations/002_medicine_tables.sql`

- [ ] **Step 1.1: Write the migration**

Write the complete SQL migration file. Note: `gen_random_uuid()` is provided by `pgcrypto` — already installed by Supabase. The `storage.buckets` table is Supabase's built-in.

```sql
-- supabase/migrations/002_medicine_tables.sql
-- Medicine tracking tables. Single user, open RLS (matches existing pattern).

-- ─── medicines ────────────────────────────────────────────────────
create table if not exists medicines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text,
  instructions text,
  image_path text,            -- Storage path in bucket 'medicine-images', not a URL
  active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medicines_active_order_idx on medicines(active, display_order);

drop trigger if exists medicines_touch on medicines;
create trigger medicines_touch before update on medicines
for each row execute function touch_app_state();   -- reuse existing function

-- ─── medicine_doses ───────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'medicine_cadence') then
    create type medicine_cadence as enum ('daily','weekdays','custom_days','every_n_days');
  end if;
end $$;

create table if not exists medicine_doses (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references medicines(id) on delete cascade,
  time_of_day time not null,
  cadence medicine_cadence not null default 'daily',
  days_of_week int[],                 -- {0..6}, 0=Sun. Used for 'weekdays'/'custom_days'
  interval_days int,                  -- used for 'every_n_days'
  start_date date,                    -- anchor for 'every_n_days'
  label text,                         -- optional, e.g. "Morning"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medicine_doses_medicine_idx on medicine_doses(medicine_id);

drop trigger if exists medicine_doses_touch on medicine_doses;
create trigger medicine_doses_touch before update on medicine_doses
for each row execute function touch_app_state();

-- ─── medicine_intake_log ──────────────────────────────────────────
create table if not exists medicine_intake_log (
  id uuid primary key default gen_random_uuid(),
  dose_id uuid not null references medicine_doses(id) on delete cascade,
  scheduled_date date not null,
  taken_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  unique(dose_id, scheduled_date)
);
create index if not exists medicine_intake_log_date_idx on medicine_intake_log(scheduled_date desc);
create index if not exists medicine_intake_log_dose_date_idx on medicine_intake_log(dose_id, scheduled_date);

-- ─── notification_recipients ──────────────────────────────────────
create table if not exists notification_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,                         -- E.164, e.g. +13035551234
  email text,                         -- reserved for future
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_recipients_touch on notification_recipients;
create trigger notification_recipients_touch before update on notification_recipients
for each row execute function touch_app_state();

-- ─── notification_send_log ────────────────────────────────────────
create table if not exists notification_send_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  for_date date not null,
  recipient_id uuid references notification_recipients(id) on delete set null,
  channel text not null default 'sms',
  status text not null,               -- 'sent' or 'failed'
  error text,
  provider_message_id text
);
create index if not exists notification_send_log_for_date_idx on notification_send_log(for_date desc);

-- ─── RLS: open access (single-user app) ───────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'medicines','medicine_doses','medicine_intake_log',
    'notification_recipients','notification_send_log'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "open_all" on %I', t);
    execute format('create policy "open_all" on %I for all using (true) with check (true)', t);
  end loop;
end$$;

-- ─── Storage bucket for medicine images (private) ─────────────────
insert into storage.buckets (id, name, public)
values ('medicine-images', 'medicine-images', false)
on conflict (id) do nothing;

-- Open storage policy for the medicine-images bucket (anon can read/write).
-- Privacy comes from the bucket being non-public + serving via signed URLs.
drop policy if exists "medicine_images_all" on storage.objects;
create policy "medicine_images_all" on storage.objects for all
  using (bucket_id = 'medicine-images')
  with check (bucket_id = 'medicine-images');

-- ─── Realtime (optional cross-device sync) ────────────────────────
do $$ begin
  perform 1;
  begin
    alter publication supabase_realtime add table medicines;
    alter publication supabase_realtime add table medicine_doses;
    alter publication supabase_realtime add table medicine_intake_log;
    alter publication supabase_realtime add table notification_recipients;
  exception when duplicate_object then null;
  end;
end $$;
```

- [ ] **Step 1.2: Apply the migration to Supabase**

Two ways:

**Option A (preferred — Supabase CLI):**
```bash
cd ~/Downloads/neck-armor
npx supabase db push
```

If `npx supabase` is not linked to the project, run `npx supabase link --project-ref <ref>` first. The project ref is in your Supabase dashboard URL.

**Option B (manual fallback):**
1. Open Supabase dashboard → SQL Editor
2. Paste the contents of `002_medicine_tables.sql`
3. Run

- [ ] **Step 1.3: Verify tables exist**

Run in Supabase SQL Editor:
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name like 'medicine%' or table_name like 'notification%';
```
Expected: 5 rows — `medicines`, `medicine_doses`, `medicine_intake_log`, `notification_recipients`, `notification_send_log`.

Also verify bucket:
```sql
select id, name, public from storage.buckets where id='medicine-images';
```
Expected: 1 row, `public = false`.

- [ ] **Step 1.4: Commit**

```bash
cd ~/Downloads/neck-armor
git add supabase/migrations/002_medicine_tables.sql
git commit -m "feat(meds): add medicine tracking schema + storage bucket

Three new tables: medicines, medicine_doses, medicine_intake_log.
Plus notification_recipients and notification_send_log for the daily
SMS recap. Private storage bucket 'medicine-images' for Rx photos.
RLS open (single-user app, matches existing pattern).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Vitest setup + cadence pure-function library

The cadence function decides "is dose D scheduled on date X?" — easy to break, worth proper unit tests.

**Files:**
- Modify: `package.json` (add deps + test script)
- Create: `vitest.config.ts`
- Create: `lib/cadence.ts`
- Create: `lib/cadence.test.ts`

- [ ] **Step 2.1: Install Vitest**

```bash
cd ~/Downloads/neck-armor
npm install -D vitest @vitest/ui
```

- [ ] **Step 2.2: Add `test` script to package.json**

Edit `package.json`. In the `"scripts"` object, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

The full scripts block becomes:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2.3: Create vitest.config.ts**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2.4: Write the failing tests first**

Create `lib/cadence.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isDoseScheduledOn, type DoseSchedule } from './cadence';

const date = (s: string) => new Date(s + 'T12:00:00');  // noon to dodge DST edges

describe('cadence: daily', () => {
  const dose: DoseSchedule = { cadence: 'daily' };
  it('fires every day', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-02'))).toBe(true);
    expect(isDoseScheduledOn(dose, date('2026-05-03'))).toBe(true);
  });
});

describe('cadence: weekdays', () => {
  const dose: DoseSchedule = { cadence: 'weekdays' };
  it('fires Mon-Fri', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-04'))).toBe(true);  // Mon
    expect(isDoseScheduledOn(dose, date('2026-05-08'))).toBe(true);  // Fri
  });
  it('skips Sat/Sun', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-02'))).toBe(false); // Sat
    expect(isDoseScheduledOn(dose, date('2026-05-03'))).toBe(false); // Sun
  });
});

describe('cadence: custom_days', () => {
  // Mon, Wed, Fri = [1, 3, 5]
  const dose: DoseSchedule = { cadence: 'custom_days', days_of_week: [1, 3, 5] };
  it('fires on listed days', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-04'))).toBe(true);  // Mon
    expect(isDoseScheduledOn(dose, date('2026-05-06'))).toBe(true);  // Wed
    expect(isDoseScheduledOn(dose, date('2026-05-08'))).toBe(true);  // Fri
  });
  it('skips other days', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-05'))).toBe(false); // Tue
    expect(isDoseScheduledOn(dose, date('2026-05-03'))).toBe(false); // Sun
  });
  it('returns false when days_of_week is empty', () => {
    expect(isDoseScheduledOn({ cadence: 'custom_days', days_of_week: [] }, date('2026-05-04'))).toBe(false);
  });
});

describe('cadence: every_n_days', () => {
  const dose: DoseSchedule = { cadence: 'every_n_days', interval_days: 3, start_date: '2026-05-01' };
  it('fires on the start date', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-01'))).toBe(true);
  });
  it('fires every N days after start', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-04'))).toBe(true);
    expect(isDoseScheduledOn(dose, date('2026-05-07'))).toBe(true);
    expect(isDoseScheduledOn(dose, date('2026-05-10'))).toBe(true);
  });
  it('skips off-cycle days', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-02'))).toBe(false);
    expect(isDoseScheduledOn(dose, date('2026-05-03'))).toBe(false);
  });
  it('returns false for dates before start', () => {
    expect(isDoseScheduledOn(dose, date('2026-04-30'))).toBe(false);
  });
});

describe('cadence: created_at gate', () => {
  // A dose can be filtered if the medicine was created after the schedule
  // would have fired. Caller supplies the medicine.created_at via the
  // optional `notBefore` argument.
  const dose: DoseSchedule = { cadence: 'daily' };
  it('returns false when date is before notBefore', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-01'), { notBefore: date('2026-05-02') })).toBe(false);
  });
  it('returns true when date is on/after notBefore', () => {
    expect(isDoseScheduledOn(dose, date('2026-05-02'), { notBefore: date('2026-05-02') })).toBe(true);
  });
});
```

- [ ] **Step 2.5: Run tests to confirm they fail**

```bash
cd ~/Downloads/neck-armor
npm test
```

Expected: FAIL — module `./cadence` not found.

- [ ] **Step 2.6: Implement `lib/cadence.ts`**

```ts
// lib/cadence.ts
// Pure function: is a given dose scheduled to fire on a given date?
// All inputs are JS Date in local time (the caller is responsible for
// time-zone normalization — typically by passing a "today in Denver" Date).

export type CadenceKind = 'daily' | 'weekdays' | 'custom_days' | 'every_n_days';

export type DoseSchedule = {
  cadence: CadenceKind;
  days_of_week?: number[] | null;   // 0=Sun..6=Sat
  interval_days?: number | null;
  start_date?: string | null;       // ISO date 'YYYY-MM-DD'
};

export type ScheduleOpts = {
  notBefore?: Date;                 // medicine.created_at — don't schedule before this
};

const DAY_MS = 86_400_000;

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);     // local midnight
}

export function isDoseScheduledOn(
  dose: DoseSchedule,
  date: Date,
  opts: ScheduleOpts = {}
): boolean {
  const day = startOfLocalDay(date);
  if (opts.notBefore && day < startOfLocalDay(opts.notBefore)) return false;

  switch (dose.cadence) {
    case 'daily':
      return true;
    case 'weekdays': {
      const dow = day.getDay();
      return dow >= 1 && dow <= 5;
    }
    case 'custom_days': {
      const list = dose.days_of_week ?? [];
      return list.includes(day.getDay());
    }
    case 'every_n_days': {
      if (!dose.start_date || !dose.interval_days || dose.interval_days < 1) return false;
      const start = startOfLocalDay(parseISODate(dose.start_date));
      if (day < start) return false;
      const diff = Math.round((day.getTime() - start.getTime()) / DAY_MS);
      return diff % dose.interval_days === 0;
    }
  }
}
```

- [ ] **Step 2.7: Run tests, verify pass**

```bash
npm test
```

Expected: all 12 tests pass (4 daily + weekdays + custom + every_n + notBefore).

- [ ] **Step 2.8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/cadence.ts lib/cadence.test.ts
git commit -m "feat(meds): cadence library + Vitest setup

Pure function isDoseScheduledOn handles daily, weekdays, custom days,
and every-N-days cadences, with an optional notBefore gate so newly
created meds don't retroactively count as 'missed'.

12 unit tests covering all cadence branches and the notBefore gate.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Types + data layer (`lib/meds.ts`)

**Files:**
- Create: `lib/meds-types.ts`
- Create: `lib/meds.ts`

- [ ] **Step 3.1: Create `lib/meds-types.ts`**

```ts
// lib/meds-types.ts
import type { CadenceKind } from './cadence';

export type Medicine = {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  image_path: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type MedicineDose = {
  id: string;
  medicine_id: string;
  time_of_day: string;          // 'HH:MM:SS' from Postgres time
  cadence: CadenceKind;
  days_of_week: number[] | null;
  interval_days: number | null;
  start_date: string | null;    // 'YYYY-MM-DD'
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicineIntakeLog = {
  id: string;
  dose_id: string;
  scheduled_date: string;       // 'YYYY-MM-DD'
  taken_at: string;
  notes: string | null;
  created_at: string;
};

export type NotificationRecipient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
};

export type NotificationSendLog = {
  id: string;
  sent_at: string;
  for_date: string;
  recipient_id: string | null;
  channel: 'sms' | 'email';
  status: 'sent' | 'failed';
  error: string | null;
  provider_message_id: string | null;
};

// A dose joined with its medicine, plus today's intake_log row if any
export type ScheduledDoseToday = {
  dose: MedicineDose;
  medicine: Medicine;
  taken_at: string | null;       // null = not yet taken
  intake_log_id: string | null;
};
```

- [ ] **Step 3.2: Create `lib/meds.ts` data layer**

```ts
// lib/meds.ts
'use client';
import { supabase } from './supabase';
import { isDoseScheduledOn } from './cadence';
import type {
  Medicine, MedicineDose, MedicineIntakeLog,
  ScheduledDoseToday, NotificationRecipient,
} from './meds-types';

// ─── Date helpers ────────────────────────────────────────────────
// Use local time everywhere. The app runs on Reid's phone in MT.

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function combineDateAndTime(date: Date, timeOfDay: string): Date {
  // timeOfDay is 'HH:MM' or 'HH:MM:SS'
  const [h, m] = timeOfDay.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// ─── Queries ─────────────────────────────────────────────────────

export async function fetchActiveMedicinesWithDoses(): Promise<{
  medicines: Medicine[];
  doses: MedicineDose[];
}> {
  const [meds, doses] = await Promise.all([
    supabase().from('medicines').select('*').eq('active', true).order('display_order'),
    supabase().from('medicine_doses').select('*'),
  ]);
  if (meds.error) throw meds.error;
  if (doses.error) throw doses.error;
  return {
    medicines: (meds.data ?? []) as Medicine[],
    doses: (doses.data ?? []) as MedicineDose[],
  };
}

export async function fetchAllMedicinesWithDoses(): Promise<{
  medicines: Medicine[];
  doses: MedicineDose[];
}> {
  const [meds, doses] = await Promise.all([
    supabase().from('medicines').select('*').order('display_order'),
    supabase().from('medicine_doses').select('*'),
  ]);
  if (meds.error) throw meds.error;
  if (doses.error) throw doses.error;
  return {
    medicines: (meds.data ?? []) as Medicine[],
    doses: (doses.data ?? []) as MedicineDose[],
  };
}

export async function fetchMedicine(id: string): Promise<{ medicine: Medicine; doses: MedicineDose[] } | null> {
  const [m, d] = await Promise.all([
    supabase().from('medicines').select('*').eq('id', id).maybeSingle(),
    supabase().from('medicine_doses').select('*').eq('medicine_id', id),
  ]);
  if (m.error) throw m.error;
  if (d.error) throw d.error;
  if (!m.data) return null;
  return { medicine: m.data as Medicine, doses: (d.data ?? []) as MedicineDose[] };
}

export async function fetchIntakeLogsForDate(dateKey: string): Promise<MedicineIntakeLog[]> {
  const { data, error } = await supabase()
    .from('medicine_intake_log').select('*').eq('scheduled_date', dateKey);
  if (error) throw error;
  return (data ?? []) as MedicineIntakeLog[];
}

export async function fetchIntakeLogsBetween(startKey: string, endKey: string): Promise<MedicineIntakeLog[]> {
  const { data, error } = await supabase()
    .from('medicine_intake_log').select('*')
    .gte('scheduled_date', startKey).lte('scheduled_date', endKey);
  if (error) throw error;
  return (data ?? []) as MedicineIntakeLog[];
}

// ─── Composition: today's scheduled doses joined with medicine + intake ──

export async function fetchScheduledDosesForDate(dateKey: string): Promise<ScheduledDoseToday[]> {
  const [{ medicines, doses }, logs] = await Promise.all([
    fetchActiveMedicinesWithDoses(),
    fetchIntakeLogsForDate(dateKey),
  ]);
  const date = parseDateKey(dateKey);
  const medById = new Map(medicines.map(m => [m.id, m]));
  const logByDose = new Map(logs.map(l => [l.dose_id, l]));
  const out: ScheduledDoseToday[] = [];
  for (const dose of doses) {
    const med = medById.get(dose.medicine_id);
    if (!med) continue;                        // dose belongs to inactive med
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    const log = logByDose.get(dose.id);
    out.push({
      dose, medicine: med,
      taken_at: log?.taken_at ?? null,
      intake_log_id: log?.id ?? null,
    });
  }
  // Sort by time_of_day
  out.sort((a, b) => a.dose.time_of_day.localeCompare(b.dose.time_of_day));
  return out;
}

function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);     // noon to dodge DST edges
}

// ─── Mutations: log a dose taken / undo ──────────────────────────

export async function logDoseTaken(doseId: string, scheduledDate: string): Promise<MedicineIntakeLog> {
  const { data, error } = await supabase()
    .from('medicine_intake_log')
    .upsert({ dose_id: doseId, scheduled_date: scheduledDate, taken_at: new Date().toISOString() },
            { onConflict: 'dose_id,scheduled_date' })
    .select()
    .single();
  if (error) throw error;
  return data as MedicineIntakeLog;
}

export async function undoDoseTaken(intakeLogId: string): Promise<void> {
  const { error } = await supabase()
    .from('medicine_intake_log').delete().eq('id', intakeLogId);
  if (error) throw error;
}

// ─── Mutations: medicines + doses ────────────────────────────────

export async function createMedicine(input: Partial<Medicine>): Promise<Medicine> {
  const { data, error } = await supabase()
    .from('medicines').insert(input).select().single();
  if (error) throw error;
  return data as Medicine;
}

export async function updateMedicine(id: string, patch: Partial<Medicine>): Promise<void> {
  const { error } = await supabase().from('medicines').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMedicine(id: string): Promise<void> {
  const { error } = await supabase().from('medicines').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertDoses(medicineId: string, doses: Array<Omit<MedicineDose, 'id' | 'medicine_id' | 'created_at' | 'updated_at'> & { id?: string }>): Promise<void> {
  // Replace strategy: delete doses for this med, insert fresh.
  // Cascade will NOT remove intake_log rows for old dose IDs we keep, because
  // we only delete doses that are not in the incoming set.
  const incomingIds = doses.filter(d => d.id).map(d => d.id!);
  // Remove doses no longer present
  let del = supabase().from('medicine_doses').delete().eq('medicine_id', medicineId);
  if (incomingIds.length > 0) del = del.not('id', 'in', `(${incomingIds.map(i => `"${i}"`).join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw delErr;
  // Upsert each
  if (doses.length > 0) {
    const rows = doses.map(d => ({ ...d, medicine_id: medicineId }));
    const { error: upsErr } = await supabase().from('medicine_doses').upsert(rows);
    if (upsErr) throw upsErr;
  }
}

// ─── Photo upload ────────────────────────────────────────────────

export async function uploadMedicineImage(file: File): Promise<string> {
  // Returns the storage path (not the URL).
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage
    .from('medicine-images')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function deleteMedicineImage(path: string): Promise<void> {
  const { error } = await supabase().storage.from('medicine-images').remove([path]);
  if (error) console.warn('[meds] delete image failed:', error.message);
}

// ─── Signed URLs ─────────────────────────────────────────────────

const SIGNED_URL_TTL_SECONDS = 60 * 60;       // 1 hour

export async function getSignedImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase().storage
    .from('medicine-images').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function getSignedImageUrls(paths: string[]): Promise<Record<string, string>> {
  // Single batched call. Skips empty/null.
  const valid = paths.filter(Boolean);
  if (valid.length === 0) return {};
  const { data, error } = await supabase().storage
    .from('medicine-images').createSignedUrls(valid, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

// ─── Recipients ──────────────────────────────────────────────────

export async function fetchRecipients(): Promise<NotificationRecipient[]> {
  const { data, error } = await supabase()
    .from('notification_recipients').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as NotificationRecipient[];
}

export async function upsertRecipient(r: Partial<NotificationRecipient> & { id?: string }): Promise<void> {
  const { error } = await supabase().from('notification_recipients').upsert(r);
  if (error) throw error;
}

export async function deleteRecipient(id: string): Promise<void> {
  const { error } = await supabase().from('notification_recipients').delete().eq('id', id);
  if (error) throw error;
}

// ─── Streak ──────────────────────────────────────────────────────

export type DayAdherence = 'all' | 'partial' | 'none' | 'no_doses';

export function adherenceForDay(scheduled: ScheduledDoseToday[]): DayAdherence {
  if (scheduled.length === 0) return 'no_doses';
  const taken = scheduled.filter(s => s.taken_at !== null).length;
  if (taken === scheduled.length) return 'all';
  if (taken === 0) return 'none';
  return 'partial';
}

// Returns the count of consecutive days (ending today or yesterday) where
// adherence === 'all' OR 'no_doses'.
export async function fetchMedsStreak(today = localDateKey()): Promise<number> {
  // Pull last 60 days of intake logs in one query, then walk backward.
  const start = new Date();
  start.setDate(start.getDate() - 60);
  const startKey = localDateKey(start);
  const [{ medicines, doses }, logs] = await Promise.all([
    fetchActiveMedicinesWithDoses(),
    fetchIntakeLogsBetween(startKey, today),
  ]);
  const medById = new Map(medicines.map(m => [m.id, m]));
  const logKey = (l: MedicineIntakeLog) => `${l.dose_id}|${l.scheduled_date}`;
  const logSet = new Set(logs.map(logKey));

  const cursor = parseDateKey(today);
  let streak = 0;
  // Anchor: today or yesterday must qualify
  for (let i = 0; i < 2; i++) {
    if (qualifies(cursor)) { streak = 0; break; }      // we'll start counting below
    cursor.setDate(cursor.getDate() - 1);
  }
  cursor.setTime(parseDateKey(today).getTime());
  if (!qualifies(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!qualifies(cursor)) return 0;
  }
  while (qualifies(cursor)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;

  function qualifies(d: Date): boolean {
    const key = localDateKey(d);
    let scheduled = 0, taken = 0;
    for (const dose of doses) {
      const med = medById.get(dose.medicine_id);
      if (!med) continue;
      const created = new Date(med.created_at);
      if (!isDoseScheduledOn(dose, d, { notBefore: created })) continue;
      scheduled++;
      if (logSet.has(`${dose.id}|${key}`)) taken++;
    }
    if (scheduled === 0) return true;        // no-dose day counts as a continued streak
    return taken === scheduled;
  }
}
```

- [ ] **Step 3.3: Sanity-check by importing from a temp scratch script**

```bash
cd ~/Downloads/neck-armor
npx tsc --noEmit
```

Expected: no type errors. (May emit a warning about the not-quite-typed Supabase response — fine.)

If errors, fix and re-run.

- [ ] **Step 3.4: Commit**

```bash
git add lib/meds-types.ts lib/meds.ts
git commit -m "feat(meds): types + data layer

lib/meds-types.ts mirrors DB rows. lib/meds.ts provides queries,
mutations, photo upload, signed URL helpers, and the streak
calculation that the home page will consume.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Daily Meds tab UI (read + check-off + overdue banner)

**Files:**
- Create: `app/meds/page.tsx`
- Create: `app/meds/components/MedCard.tsx`
- Create: `app/meds/components/OverdueBanner.tsx`

- [ ] **Step 4.1: Create `OverdueBanner.tsx`**

```tsx
// app/meds/components/OverdueBanner.tsx
'use client';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import { combineDateAndTime } from '@/lib/meds';
import { AlertTriangle } from 'lucide-react';

export default function OverdueBanner({ scheduled }: { scheduled: ScheduledDoseToday[] }) {
  const now = new Date();
  const overdue = scheduled.filter(s => {
    if (s.taken_at) return false;
    return now >= combineDateAndTime(now, s.dose.time_of_day);
  });
  if (overdue.length === 0) return null;

  const firstOverdue = overdue[0];
  const time = firstOverdue.dose.time_of_day.slice(0, 5);
  const remaining = scheduled.length - scheduled.filter(s => s.taken_at).length;

  // Past 8pm = day-end nudge
  const past8 = now.getHours() >= 20;
  const text = past8
    ? `Today: ${scheduled.length - remaining}/${scheduled.length} taken — finish before midnight to keep your streak.`
    : `${overdue.length} dose${overdue.length > 1 ? 's' : ''} overdue — ${firstOverdue.medicine.name} due at ${formatTime(time)}`;

  return (
    <div className="flex items-center gap-2 rounded-lg p-3 mb-3 border"
      style={{
        background: 'var(--accent-red-bg)',
        borderColor: 'var(--accent-red-border)',
        color: 'var(--accent-red)',
      }}>
      <AlertTriangle size={16} />
      <span className="text-xs font-medium">{text}</span>
    </div>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
```

- [ ] **Step 4.2: Create `MedCard.tsx`**

```tsx
// app/meds/components/MedCard.tsx
'use client';
import { useState } from 'react';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import { combineDateAndTime } from '@/lib/meds';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export default function MedCard({
  item,
  imageUrl,
  onToggle,
}: {
  item: ScheduledDoseToday;
  imageUrl: string | null;
  onToggle: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);

  const taken = item.taken_at !== null;
  const now = new Date();
  const due = combineDateAndTime(now, item.dose.time_of_day);
  const past = now >= due;
  const overdue = past && !taken;

  const handleCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    if (navigator.vibrate) navigator.vibrate(10);
    try { await onToggle(); } finally { setPending(false); }
  };

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      className="rounded-xl border p-3 mb-2 transition-colors cursor-pointer active:scale-[0.99]"
      style={{
        background: taken ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        borderColor: overdue ? 'var(--accent-red-border)' : 'var(--border-primary)',
        opacity: taken ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover bg-white/5" />
        ) : (
          <div className="w-14 h-14 rounded-lg flex items-center justify-center text-xl"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>💊</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-app truncate">{item.medicine.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(item.dose.time_of_day)}
            {item.dose.label ? ` · ${item.dose.label}` : ''}
          </div>
        </div>
        <button
          onClick={handleCheck}
          disabled={pending}
          aria-label={taken ? 'Undo' : 'Mark taken'}
          className="w-10 h-10 rounded-lg border flex items-center justify-center transition"
          style={{
            background: taken ? 'var(--accent-emerald)' : 'transparent',
            borderColor: taken ? 'var(--accent-emerald)' : (overdue ? 'var(--accent-red-border)' : 'var(--border-secondary)'),
          }}
        >
          {taken && <Check size={20} color="white" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t text-xs space-y-1.5"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          {item.medicine.purpose && <div><strong style={{ color: 'var(--text-primary)' }}>For:</strong> {item.medicine.purpose}</div>}
          {item.medicine.instructions && <div><strong style={{ color: 'var(--text-primary)' }}>How:</strong> {item.medicine.instructions}</div>}
          {!item.medicine.purpose && !item.medicine.instructions && (
            <div style={{ color: 'var(--text-tertiary)' }}>No notes yet.</div>
          )}
          <div className="pt-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>tap to collapse</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
```

- [ ] **Step 4.3: Create `app/meds/page.tsx`**

```tsx
// app/meds/page.tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Pill, Settings as Cog } from 'lucide-react';
import {
  fetchScheduledDosesForDate, getSignedImageUrls, logDoseTaken, undoDoseTaken,
  localDateKey,
} from '@/lib/meds';
import type { ScheduledDoseToday } from '@/lib/meds-types';
import MedCard from './components/MedCard';
import OverdueBanner from './components/OverdueBanner';

const REFRESH_MS = 60_000;   // re-render once a minute so "overdue" picks up

export default function MedsPage() {
  const [items, setItems] = useState<ScheduledDoseToday[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const today = localDateKey();

  const reload = useCallback(async () => {
    const next = await fetchScheduledDosesForDate(today);
    const paths = next.map(i => i.medicine.image_path).filter((p): p is string => !!p);
    const urls = paths.length ? await getSignedImageUrls(paths) : {};
    setItems(next);
    setImageUrls(urls);
  }, [today]);

  useEffect(() => { reload(); }, [reload]);

  // Tick every minute so "overdue" status recomputes without user action
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const onToggle = async (item: ScheduledDoseToday) => {
    if (item.taken_at && item.intake_log_id) {
      await undoDoseTaken(item.intake_log_id);
    } else {
      await logDoseTaken(item.dose.id, today);
    }
    await reload();
  };

  if (items === null) {
    return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;
  }

  // Group by time-of-day
  const groups = groupByTimeWindow(items);

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)', /* tick */ ['--meds-tick' as string]: tick }}>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold text-app">Meds</h1>
        <Link href="/settings/manage-meds" className="text-xs flex items-center gap-1"
          style={{ color: 'var(--text-secondary)' }}>
          <Cog size={14} /> Manage
        </Link>
      </div>

      <OverdueBanner scheduled={items} />

      {items.length === 0 && (
        <div className="rounded-xl border p-6 text-center"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          <Pill size={28} className="mx-auto mb-2 opacity-60" />
          <div className="text-sm font-medium text-app">No meds scheduled today</div>
          <div className="text-xs mt-1">Add medicines from Settings → Manage Medicines.</div>
        </div>
      )}

      {groups.map(g => (
        <section key={g.label} className="mb-5">
          <div className="text-[10px] font-medium tracking-widest mb-2 uppercase"
            style={{ color: 'var(--text-secondary)' }}>{g.label}</div>
          {g.items.map(it => (
            <MedCard
              key={it.dose.id}
              item={it}
              imageUrl={it.medicine.image_path ? (imageUrls[it.medicine.image_path] ?? null) : null}
              onToggle={() => onToggle(it)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function groupByTimeWindow(items: ScheduledDoseToday[]): { label: string; items: ScheduledDoseToday[] }[] {
  // Group by hour-of-day bucket: <11 = Morning, <17 = Midday, <20 = Evening, else Bedtime.
  const buckets: Record<string, ScheduledDoseToday[]> = {
    Morning: [], Midday: [], Evening: [], Bedtime: [],
  };
  for (const it of items) {
    const h = parseInt(it.dose.time_of_day.slice(0, 2), 10);
    const bucket = h < 11 ? 'Morning' : h < 17 ? 'Midday' : h < 20 ? 'Evening' : 'Bedtime';
    buckets[bucket].push(it);
  }
  return Object.entries(buckets)
    .filter(([_, arr]) => arr.length > 0)
    .map(([label, items]) => ({ label, items }));
}
```

- [ ] **Step 4.4: Commit (UI compiles, has no doses to render yet — that's fine)**

```bash
git add app/meds
git commit -m "feat(meds): daily meds tab + med card + overdue banner

Tab renders today's scheduled doses grouped by time-of-day window
(Morning/Midday/Evening/Bedtime). Tap to expand for purpose +
instructions; tap checkbox to log/undo. Refreshes overdue state
every minute. Empty-state directs user to Manage Medicines.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Bottom nav — add Meds tab + red dot

**Files:**
- Modify: `app/components/BottomNav.tsx`

- [ ] **Step 5.1: Update `BottomNav.tsx`**

Replace the entire file:

```tsx
// app/components/BottomNav.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Dumbbell, Calendar, Settings, Target, Beef, Pill } from 'lucide-react';
import { fetchScheduledDosesForDate, localDateKey, combineDateAndTime } from '@/lib/meds';

const TABS = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/nutrition', label: 'Fuel', icon: Beef },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/meds', label: 'Meds', icon: Pill },
  { href: '/calendar', label: 'Plan', icon: Calendar },
  { href: '/catches', label: 'Catches', icon: Target },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const RECHECK_MS = 60_000;

export default function BottomNav() {
  const pathname = usePathname();
  const [medsAlert, setMedsAlert] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const items = await fetchScheduledDosesForDate(localDateKey());
        const now = new Date();
        const hasOverdue = items.some(s =>
          !s.taken_at && now >= combineDateAndTime(now, s.dose.time_of_day));
        if (alive) setMedsAlert(hasOverdue);
      } catch { /* ignore — nav badge is best-effort */ }
    };
    check();
    const id = setInterval(check, RECHECK_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 backdrop-blur nav-bg border-t border-app bottom-nav z-20">
      <div className="max-w-md mx-auto grid grid-cols-7 pt-2">
        {TABS.map(t => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          const Icon = t.icon;
          const showDot = t.href === '/meds' && medsAlert;
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 py-1 relative"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              <div className="relative">
                <Icon size={20} />
                {showDot && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full"
                    style={{ background: 'var(--accent-red, #ef4444)' }} />
                )}
              </div>
              <span className="text-[10px]">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 5.2: Visual check in dev**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Bottom nav now shows 7 tabs including a Pill icon labeled "Meds"
- Tapping Meds tab navigates to `/meds`
- Empty-state appears (no meds yet)

Stop dev server.

- [ ] **Step 5.3: Commit**

```bash
git add app/components/BottomNav.tsx
git commit -m "feat(meds): add Meds tab to bottom nav with overdue red dot

Nav goes from 6 to 7 tabs. Polls scheduled doses every minute and
shows a red dot on the Meds icon if any of today's already-due
doses are unchecked.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Manage Medicines admin (list + form + photo upload + delete)

**Files:**
- Create: `app/settings/manage-meds/page.tsx`
- Create: `app/settings/manage-meds/[id]/page.tsx`
- Create: `app/settings/manage-meds/new/page.tsx`
- Create: `app/settings/manage-meds/_components/MedForm.tsx`

- [ ] **Step 6.1: Shared form component**

```tsx
// app/settings/manage-meds/_components/MedForm.tsx
'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus, Camera } from 'lucide-react';
import {
  createMedicine, updateMedicine, upsertDoses, deleteMedicine,
  uploadMedicineImage, deleteMedicineImage, getSignedImageUrl,
} from '@/lib/meds';
import type { Medicine, MedicineDose } from '@/lib/meds-types';
import type { CadenceKind } from '@/lib/cadence';

export type DoseDraft = {
  id?: string;
  time_of_day: string;          // 'HH:MM'
  cadence: CadenceKind;
  days_of_week: number[];
  interval_days: number;
  start_date: string;           // 'YYYY-MM-DD'
  label: string;
};

const emptyDose = (): DoseDraft => ({
  time_of_day: '08:00',
  cadence: 'daily',
  days_of_week: [],
  interval_days: 1,
  start_date: new Date().toISOString().slice(0, 10),
  label: '',
});

export default function MedForm({
  medicine,
  doses,
}: {
  medicine?: Medicine;
  doses?: MedicineDose[];
}) {
  const router = useRouter();
  const isEdit = !!medicine;
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(medicine?.name ?? '');
  const [purpose, setPurpose] = useState(medicine?.purpose ?? '');
  const [instructions, setInstructions] = useState(medicine?.instructions ?? '');
  const [active, setActive] = useState(medicine?.active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(medicine?.image_path ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [doseDrafts, setDoseDrafts] = useState<DoseDraft[]>(
    doses && doses.length > 0
      ? doses.map(d => ({
          id: d.id,
          time_of_day: d.time_of_day.slice(0, 5),
          cadence: d.cadence,
          days_of_week: d.days_of_week ?? [],
          interval_days: d.interval_days ?? 1,
          start_date: d.start_date ?? new Date().toISOString().slice(0, 10),
          label: d.label ?? '',
        }))
      : [emptyDose()]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (imagePath) getSignedImageUrl(imagePath).then(setImageUrl).catch(() => setImageUrl(null));
    else setImageUrl(null);
  }, [imagePath]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image too large (>5MB).'); return; }
    setBusy(true); setError(null);
    try {
      const newPath = await uploadMedicineImage(f);
      if (imagePath) await deleteMedicineImage(imagePath);
      setImagePath(newPath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const updateDose = (idx: number, patch: Partial<DoseDraft>) => {
    setDoseDrafts(arr => arr.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };
  const removeDose = (idx: number) => setDoseDrafts(arr => arr.filter((_, i) => i !== idx));
  const addDose = () => setDoseDrafts(arr => [...arr, emptyDose()]);

  const onSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (doseDrafts.length === 0) { setError('Add at least one dose.'); return; }
    for (const d of doseDrafts) {
      if (d.cadence === 'custom_days' && d.days_of_week.length === 0) {
        setError('Pick at least one day for "Specific days" doses.'); return;
      }
      if (d.cadence === 'every_n_days' && (!d.interval_days || d.interval_days < 1)) {
        setError('Interval must be at least 1 day.'); return;
      }
    }
    setBusy(true); setError(null);
    try {
      const medRow = {
        name: name.trim(),
        purpose: purpose.trim() || null,
        instructions: instructions.trim() || null,
        active,
        image_path: imagePath,
      };
      let medId = medicine?.id;
      if (isEdit) {
        await updateMedicine(medicine!.id, medRow);
      } else {
        const created = await createMedicine(medRow);
        medId = created.id;
      }
      const cleanedDoses = doseDrafts.map(d => ({
        id: d.id,
        time_of_day: d.time_of_day,
        cadence: d.cadence,
        days_of_week: d.cadence === 'weekdays' ? [1, 2, 3, 4, 5]
          : d.cadence === 'custom_days' ? d.days_of_week
          : null,
        interval_days: d.cadence === 'every_n_days' ? d.interval_days : null,
        start_date: d.cadence === 'every_n_days' ? d.start_date : null,
        label: d.label.trim() || null,
      }));
      await upsertDoses(medId!, cleanedDoses as any);
      router.push('/settings/manage-meds');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!medicine) return;
    if (!confirm(`Delete "${medicine.name}"? All intake history for this medicine will also be erased. This cannot be undone.`)) return;
    setBusy(true);
    try {
      if (medicine.image_path) await deleteMedicineImage(medicine.image_path);
      await deleteMedicine(medicine.id);
      router.push('/settings/manage-meds');
    } catch (err) {
      setError((err as Error).message); setBusy(false);
    }
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <h1 className="text-xl font-semibold mb-4 text-app">{isEdit ? 'Edit medicine' : 'Add medicine'}</h1>

      {/* Photo */}
      <div className="mb-5 flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--bg-tertiary)' }}>
          {imageUrl
            ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            : <Camera size={28} style={{ color: 'var(--text-tertiary)' }} />}
        </div>
        <div>
          <input ref={fileInput} type="file" accept="image/*" capture="environment"
            onChange={onPickFile} className="hidden" id="med-photo" />
          <label htmlFor="med-photo"
            className="inline-block py-2 px-3 text-sm rounded-md border cursor-pointer"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
            {imagePath ? 'Replace photo' : 'Add photo'}
          </label>
          {imagePath && (
            <button type="button" onClick={() => { if (imagePath) deleteMedicineImage(imagePath); setImagePath(null); }}
              className="block text-xs mt-1.5" style={{ color: 'var(--accent-red)' }}>Remove</button>
          )}
        </div>
      </div>

      {/* Name */}
      <Field label="Name">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Terbinafine 250mg"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-app"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }} />
      </Field>

      {/* Purpose */}
      <Field label="What it's for">
        <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2}
          placeholder="Antifungal — for skin/nail fungus"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-app resize-none"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }} />
      </Field>

      {/* Instructions */}
      <Field label="How to take">
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
          placeholder="1 tablet by mouth with food"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-app resize-none"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }} />
      </Field>

      {/* Active toggle */}
      <Field label="Active">
        <button type="button" onClick={() => setActive(!active)}
          className="w-11 h-6 rounded-full relative transition-colors"
          style={{ background: active ? 'var(--accent-emerald)' : 'var(--border-secondary)' }}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </Field>

      {/* Doses */}
      <div className="text-[10px] font-medium tracking-widest mb-2 mt-4" style={{ color: 'var(--text-secondary)' }}>DOSES</div>
      {doseDrafts.map((d, i) => (
        <DoseEditor key={i} value={d}
          onChange={p => updateDose(i, p)}
          onRemove={() => removeDose(i)}
          canRemove={doseDrafts.length > 1} />
      ))}
      <button type="button" onClick={addDose}
        className="w-full py-2 mb-4 text-sm rounded-md border flex items-center justify-center gap-1"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
        <Plus size={14} /> Add dose
      </button>

      {error && <div className="text-xs mb-3" style={{ color: 'var(--accent-red)' }}>{error}</div>}

      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy}
          className="flex-1 py-2.5 rounded-md font-medium disabled:opacity-50"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {isEdit && (
          <button onClick={onDelete} disabled={busy}
            className="py-2.5 px-3 rounded-md border disabled:opacity-50"
            style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red-border)', color: 'var(--accent-red)' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-medium tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function DoseEditor({
  value, onChange, onRemove, canRemove,
}: {
  value: DoseDraft;
  onChange: (p: Partial<DoseDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-lg p-3 mb-2 border"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-2 mb-2">
        <input type="time" value={value.time_of_day}
          onChange={e => onChange({ time_of_day: e.target.value })}
          className="px-2 py-1 rounded border bg-transparent text-app"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
        <input value={value.label} onChange={e => onChange({ label: e.target.value })}
          placeholder="Label (optional)" className="flex-1 px-2 py-1 rounded border bg-transparent text-app text-sm"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ color: 'var(--accent-red)' }}><Trash2 size={14} /></button>
        )}
      </div>
      <select value={value.cadence}
        onChange={e => onChange({ cadence: e.target.value as CadenceKind })}
        className="w-full px-2 py-1.5 rounded border bg-transparent text-app text-sm mb-2"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
        <option value="daily">Every day</option>
        <option value="weekdays">Weekdays only (Mon–Fri)</option>
        <option value="custom_days">Specific days</option>
        <option value="every_n_days">Every N days</option>
      </select>
      {value.cadence === 'custom_days' && (
        <div className="flex gap-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, idx) => {
            const on = value.days_of_week.includes(idx);
            return (
              <button key={idx} type="button"
                onClick={() => onChange({
                  days_of_week: on
                    ? value.days_of_week.filter(d => d !== idx)
                    : [...value.days_of_week, idx].sort()
                })}
                className="flex-1 py-1 text-[11px] rounded border"
                style={{
                  background: on ? 'var(--accent-emerald)' : 'var(--bg-tertiary)',
                  borderColor: on ? 'var(--accent-emerald)' : 'var(--border-primary)',
                  color: on ? 'white' : 'var(--text-secondary)',
                }}>{label}</button>
            );
          })}
        </div>
      )}
      {value.cadence === 'every_n_days' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Every</span>
          <input type="number" min={1} value={value.interval_days}
            onChange={e => onChange({ interval_days: parseInt(e.target.value) || 1 })}
            className="w-16 px-2 py-1 rounded border bg-transparent text-app"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>days from</span>
          <input type="date" value={value.start_date}
            onChange={e => onChange({ start_date: e.target.value })}
            className="px-2 py-1 rounded border bg-transparent text-app"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: List page**

```tsx
// app/settings/manage-meds/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ArrowLeft } from 'lucide-react';
import { fetchAllMedicinesWithDoses, getSignedImageUrls } from '@/lib/meds';
import type { Medicine, MedicineDose } from '@/lib/meds-types';

export default function ManageMedsPage() {
  const [meds, setMeds] = useState<Medicine[] | null>(null);
  const [doses, setDoses] = useState<MedicineDose[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { medicines, doses } = await fetchAllMedicinesWithDoses();
      const paths = medicines.map(m => m.image_path).filter((p): p is string => !!p);
      const urls = paths.length ? await getSignedImageUrls(paths) : {};
      setMeds(medicines); setDoses(doses); setImageUrls(urls);
    })();
  }, []);

  if (meds === null) return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <Link href="/settings" className="text-xs flex items-center gap-1 mb-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={12} /> Settings
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-app">Manage Medicines</h1>
        <Link href="/settings/manage-meds/new"
          className="flex items-center gap-1 py-1.5 px-3 rounded-md text-sm font-medium"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          <Plus size={14} /> Add
        </Link>
      </div>

      {meds.length === 0 && (
        <div className="rounded-xl border p-6 text-center"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          <div className="text-sm">No medicines yet. Tap Add to start.</div>
        </div>
      )}

      <div className="space-y-2">
        {meds.map(m => {
          const dCount = doses.filter(d => d.medicine_id === m.id).length;
          const url = m.image_path ? imageUrls[m.image_path] : null;
          return (
            <Link key={m.id} href={`/settings/manage-meds/${m.id}`}
              className="flex items-center gap-3 rounded-xl p-3 border transition active:scale-[0.99]"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                opacity: m.active ? 1 : 0.5,
              }}>
              <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ background: 'var(--bg-tertiary)' }}>
                {url ? <img src={url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xl">💊</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-app truncate">{m.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {dCount} dose{dCount === 1 ? '' : 's'}{m.active ? '' : ' · paused'}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: New page**

```tsx
// app/settings/manage-meds/new/page.tsx
'use client';
import MedForm from '../_components/MedForm';
export default function NewMedPage() {
  return <MedForm />;
}
```

- [ ] **Step 6.4: Edit page**

```tsx
// app/settings/manage-meds/[id]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchMedicine } from '@/lib/meds';
import type { Medicine, MedicineDose } from '@/lib/meds-types';
import MedForm from '../_components/MedForm';

export default function EditMedPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ medicine: Medicine; doses: MedicineDose[] } | null | 'missing'>(null);

  useEffect(() => {
    fetchMedicine(id).then(d => setData(d ?? 'missing'));
  }, [id]);

  if (data === null) return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;
  if (data === 'missing') return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Medicine not found.</div>;

  return <MedForm medicine={data.medicine} doses={data.doses} />;
}
```

- [ ] **Step 6.5: Add link to settings page**

In `app/settings/page.tsx`, find the existing `<div>` for the NOTIFICATIONS section. After the closing `</div>` of that section (around line 136), insert a new MEDICINE section:

```tsx
      <div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>MEDICINE</div>
      <div className="space-y-2 mb-6">
        <Link href="/settings/manage-meds"
          className="block w-full py-2.5 px-3 text-sm rounded-md font-medium border text-left"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
          Manage Medicines
        </Link>
        <Link href="/settings/recipients"
          className="block w-full py-2.5 px-3 text-sm rounded-md font-medium border text-left"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
          Notification Recipients
        </Link>
      </div>
```

Also at the top of `app/settings/page.tsx`, add the import:
```tsx
import Link from 'next/link';
```

(Add it next to the other imports near the top of the file.)

- [ ] **Step 6.6: Manual smoke test**

```bash
npm run dev
```

In the browser:
1. Settings → Manage Medicines → Add
2. Fill: Name "Test Med", Purpose "testing", a dose at 8:00am daily
3. Save → returns to list, sees Test Med
4. Open it → edit name → Save → list shows new name
5. Delete → confirms, removes
6. Stop dev server.

- [ ] **Step 6.7: Commit**

```bash
git add app/settings/manage-meds app/settings/page.tsx
git commit -m "feat(meds): manage medicines admin (list + form + photo upload)

Settings → Manage Medicines list with add/edit/delete. MedForm handles
name, purpose, instructions, active toggle, photo upload to private
Storage bucket, and 1+ doses per medicine with daily/weekdays/custom
days/every-N-days cadence.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Notification Recipients admin

**Files:**
- Create: `app/settings/recipients/page.tsx`

- [ ] **Step 7.1: Create the recipients page**

```tsx
// app/settings/recipients/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { fetchRecipients, upsertRecipient, deleteRecipient } from '@/lib/meds';
import type { NotificationRecipient } from '@/lib/meds-types';

type Draft = Partial<NotificationRecipient> & { _isNew?: boolean };

export default function RecipientsPage() {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetchRecipients().then(r => setRows(r as Draft[])); }, []);

  const reload = async () => setRows(await fetchRecipients() as Draft[]);

  const update = (idx: number, patch: Partial<Draft>) =>
    setRows(arr => arr!.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const addRow = () =>
    setRows(arr => [...(arr ?? []), { name: '', phone: '', active: true, _isNew: true }]);

  const save = async (idx: number) => {
    const r = rows![idx];
    if (!r.name?.trim()) { setErr('Name required.'); return; }
    if (r.phone && !/^\+\d{8,15}$/.test(r.phone)) {
      setErr('Phone must be E.164, e.g. +13035551234'); return;
    }
    setBusy(true); setErr(null);
    try {
      await upsertRecipient({
        id: r._isNew ? undefined : r.id,
        name: r.name!.trim(),
        phone: r.phone?.trim() || null,
        active: r.active ?? true,
      });
      await reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (idx: number) => {
    const r = rows![idx];
    if (r._isNew) { setRows(arr => arr!.filter((_, i) => i !== idx)); return; }
    if (!confirm(`Delete recipient "${r.name}"?`)) return;
    setBusy(true);
    try { await deleteRecipient(r.id!); await reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (rows === null) return <div className="px-4 py-4 text-app" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>Loading…</div>;

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <Link href="/settings" className="text-xs flex items-center gap-1 mb-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={12} /> Settings
      </Link>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold text-app">Notification Recipients</h1>
        <button onClick={addRow}
          className="flex items-center gap-1 py-1.5 px-3 rounded-md text-sm font-medium"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Phone numbers in E.164 format, e.g. <code>+13035551234</code>. Only active recipients with a phone receive the 10pm SMS recap.
      </div>

      {err && <div className="text-xs mb-3" style={{ color: 'var(--accent-red)' }}>{err}</div>}

      {rows.map((r, i) => (
        <div key={r.id ?? i} className="rounded-lg p-3 mb-2 border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-2 mb-2">
            <input value={r.name ?? ''} onChange={e => update(i, { name: e.target.value })}
              placeholder="Name" className="flex-1 px-2 py-1 rounded border bg-transparent text-app text-sm"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
            <button onClick={() => remove(i)}
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ color: 'var(--accent-red)' }}><Trash2 size={14} /></button>
          </div>
          <input value={r.phone ?? ''} onChange={e => update(i, { phone: e.target.value })}
            placeholder="+13035551234" inputMode="tel"
            className="w-full px-2 py-1.5 rounded border bg-transparent text-app text-sm mb-2"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={r.active ?? true}
                onChange={e => update(i, { active: e.target.checked })} />
              Active
            </label>
            <button onClick={() => save(i)} disabled={busy}
              className="py-1 px-3 rounded text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--accent-emerald)', color: 'white' }}>
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7.2: Manual smoke test**

```bash
npm run dev
```

Open Settings → Notification Recipients. Add Dad (no phone yet), Mom, Reid. Save each. Verify they persist on reload. Stop dev server.

- [ ] **Step 7.3: Commit**

```bash
git add app/settings/recipients
git commit -m "feat(meds): notification recipients admin page

Add/edit/delete SMS recipients in-app. Validates E.164 format.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: History → Meds calendar

**Files:**
- Create: `app/history/meds/page.tsx`
- Modify: `app/history/page.tsx` — add a link to the new sub-page (top of file)

- [ ] **Step 8.1: Create the meds history page**

```tsx
// app/history/meds/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import {
  fetchActiveMedicinesWithDoses, fetchIntakeLogsBetween, localDateKey,
} from '@/lib/meds';
import type { Medicine, MedicineDose, MedicineIntakeLog } from '@/lib/meds-types';
import { isDoseScheduledOn } from '@/lib/cadence';
import type { DayAdherence } from '@/lib/meds';

const DAY_NAMES = ['S','M','T','W','T','F','S'];

export default function MedsHistoryPage() {
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [data, setData] = useState<{
    medicines: Medicine[];
    doses: MedicineDose[];
    logs: MedicineIntakeLog[];
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const start = new Date(cursor);
      start.setDate(1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1); end.setDate(0);
      const [{ medicines, doses }, logs] = await Promise.all([
        fetchActiveMedicinesWithDoses(),
        fetchIntakeLogsBetween(localDateKey(start), localDateKey(end)),
      ]);
      setData({ medicines, doses, logs });
    })();
  }, [cursor]);

  const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(cursor); firstDay.setDate(1);
  const blanks = firstDay.getDay();
  const lastDay = new Date(cursor); lastDay.setMonth(lastDay.getMonth() + 1); lastDay.setDate(0);
  const daysInMonth = lastDay.getDate();

  const dayInfo = (day: number): { key: string; adherence: DayAdherence; scheduled: number; taken: number } => {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day, 12, 0, 0);
    const key = localDateKey(d);
    if (!data) return { key, adherence: 'no_doses', scheduled: 0, taken: 0 };
    const medById = new Map(data.medicines.map(m => [m.id, m]));
    let scheduled = 0, taken = 0;
    for (const dose of data.doses) {
      const med = medById.get(dose.medicine_id);
      if (!med) continue;
      const created = new Date(med.created_at);
      if (!isDoseScheduledOn(dose, d, { notBefore: created })) continue;
      scheduled++;
      if (data.logs.some(l => l.dose_id === dose.id && l.scheduled_date === key)) taken++;
    }
    let adherence: DayAdherence = 'no_doses';
    if (scheduled > 0) {
      adherence = taken === scheduled ? 'all' : taken === 0 ? 'none' : 'partial';
    }
    return { key, adherence, scheduled, taken };
  };

  return (
    <div className="px-4 py-4 pb-24" style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}>
      <Link href="/history" className="text-xs flex items-center gap-1 mb-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={12} /> History
      </Link>
      <h1 className="text-xl font-semibold mb-4 text-app">Meds History</h1>

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth() - 1); return n; })}
          className="p-2 rounded" style={{ color: 'var(--text-secondary)' }}><ChevronLeft size={18} /></button>
        <div className="text-sm font-medium text-app">{monthLabel}</div>
        <button onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth() + 1); return n; })}
          className="p-2 rounded" style={{ color: 'var(--text-secondary)' }}><ChevronRight size={18} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const info = dayInfo(day);
          const today = info.key === localDateKey();
          return (
            <button key={day} onClick={() => setSelectedDay(info.key)}
              className="aspect-square rounded text-xs font-medium flex items-center justify-center"
              style={{
                background: colorForAdherence(info.adherence),
                color: info.adherence === 'no_doses' ? 'var(--text-tertiary)' : 'white',
                outline: today ? '2px solid var(--text-primary)' : 'none',
                outlineOffset: today ? -2 : 0,
              }}>{day}</button>
          );
        })}
      </div>

      <Legend />

      {selectedDay && data && (
        <DayDetail dateKey={selectedDay} data={data} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}

function colorForAdherence(a: DayAdherence): string {
  switch (a) {
    case 'all': return '#10b981';
    case 'partial': return '#f59e0b';
    case 'none': return '#ef4444';
    case 'no_doses': return 'var(--bg-tertiary)';
  }
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] mb-4" style={{ color: 'var(--text-secondary)' }}>
      <Sw color="#10b981" label="All taken" />
      <Sw color="#f59e0b" label="Partial" />
      <Sw color="#ef4444" label="None" />
      <Sw color="var(--bg-tertiary)" label="No doses" />
    </div>
  );
  function Sw({ color, label }: { color: string; label: string }) {
    return <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: color }} /> {label}</div>;
  }
}

function DayDetail({
  dateKey, data, onClose,
}: {
  dateKey: string;
  data: { medicines: Medicine[]; doses: MedicineDose[]; logs: MedicineIntakeLog[] };
  onClose: () => void;
}) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const medById = new Map(data.medicines.map(m => [m.id, m]));
  const items: { name: string; time: string; taken: boolean }[] = [];
  for (const dose of data.doses) {
    const med = medById.get(dose.medicine_id);
    if (!med) continue;
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    const taken = data.logs.some(l => l.dose_id === dose.id && l.scheduled_date === dateKey);
    items.push({ name: med.name, time: dose.time_of_day.slice(0, 5), taken });
  }
  items.sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-app">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--text-secondary)' }}>close</button>
      </div>
      {items.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No doses scheduled.</div>
      )}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
          {it.taken ? <Check size={14} color="var(--accent-emerald)" /> : <X size={14} color="var(--accent-red)" />}
          <span className="flex-1 text-app">{it.name}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{formatTime(it.time)}</span>
        </div>
      ))}
    </div>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
```

- [ ] **Step 8.2: Add link from main History page**

In `app/history/page.tsx`, near the top of the rendered content (under the existing `<h1>...History & PRs</h1>` line), add a link:

```tsx
<Link href="/history/meds" className="block mb-3 text-sm rounded-lg p-3 border"
  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
  💊 Meds History →
</Link>
```

Add `import Link from 'next/link';` at the top of the file (next to the other imports) if not present.

- [ ] **Step 8.3: Commit**

```bash
git add app/history
git commit -m "feat(meds): history calendar grid + day detail

New /history/meds page with month grid (green=all, yellow=partial,
red=none, gray=no doses), month nav, and a day-detail card showing
each scheduled dose and whether it was taken.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Streak integration on Home page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 9.1: Add Meds streak to home**

Open `app/page.tsx`. The page currently fetches 3 streaks (fuel, workout, catches) and renders them in a `grid-cols-3`. We need to:
1. Fetch the meds streak too
2. Change the grid to `grid-cols-2 ... grid-cols-4` (4 cards on a row may be cramped on small screens — use a 2x2 grid instead)

Edit imports near the top to add:
```tsx
import { fetchMedsStreak } from '@/lib/meds';
import { Pill } from 'lucide-react';
```

Add state next to the existing streak states (in the `HomePage` function, near `const [catchStreak, setCatchStreak]`):

```tsx
const [medsStreak, setMedsStreak] = useState<number | null>(null);
```

Update the existing `useEffect` `Promise.all`:

```tsx
const [rows, history, catches, medsStreakValue] = await Promise.all([
  fetchNutritionLogs(35),
  loadHistoryAsync(),
  loadCatchesAsync(),
  fetchMedsStreak(),
]);
if (!alive) return;
setFuelStreak(nutritionStreak(rows, today));
setFuelAtRisk(nutritionAtRisk(rows, today));
setWorkoutStreak(workoutStreakFromHistory(history));
setCatchStreak(catchesStats(catches).streak);
setMedsStreak(medsStreakValue);
```

Then change the streak grid from `grid-cols-3` to `grid-cols-2`, and add a 4th card. The full streaks block becomes:

```tsx
<SectionLabel>Day Streaks</SectionLabel>
<div className="grid grid-cols-2 gap-2 mb-5">
  <SparkCard label="Fuel" icon="🥩" streak={fuelStreak} atRisk={fuelAtRisk} accent="#fb923c" />
  <SparkCard label="Workout" icon="💪" streak={workoutStreak} atRisk={false} accent="#3b82f6" />
  <SparkCard label="Meds" icon="💊" streak={medsStreak} atRisk={false} accent="#a855f7" />
  <SparkCard label="Catches" icon="🎯" streak={catchStreak} atRisk={false} accent="#10b981" />
</div>
```

Also add a quick link:

```tsx
<QuickLink href="/meds" label="Meds" subtitle="Today's meds" Icon={Pill} accent="#a855f7" />
```

Insert it between the Workout and Catches `<QuickLink />` rows.

- [ ] **Step 9.2: Smoke test**

```bash
npm run dev
```

Open home. Verify the Meds streak card appears. With no doses today, the streak counter should show 0 (no streak). Stop dev.

- [ ] **Step 9.3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(meds): meds streak + quick link on home

Meds streak card uses the same SparkCard component. Switched grid
from 3 cols to 2x2 to fit four streaks comfortably on small screens.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Twilio wrapper + send-daily-summary route + cron

**Files:**
- Modify: `package.json` (add `twilio` dep)
- Create: `lib/twilio.ts`
- Create: `app/api/send-daily-summary/route.ts`
- Create: `vercel.json`

- [ ] **Step 10.1: Install Twilio**

```bash
cd ~/Downloads/neck-armor
npm install twilio
```

- [ ] **Step 10.2: Create `lib/twilio.ts`**

```ts
// lib/twilio.ts — server-only
import twilioClient from 'twilio';

export type SendResult = {
  success: boolean;
  providerMessageId?: string;
  error?: string;
};

export async function sendSms(toE164: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { success: false, error: 'Twilio env vars missing' };
  }
  try {
    const client = twilioClient(sid, token);
    const msg = await client.messages.create({ from, to: toE164, body });
    return { success: true, providerMessageId: msg.sid };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 10.3: Create the cron route**

```ts
// app/api/send-daily-summary/route.ts
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
  // Format the current instant in America/Denver as YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now);   // en-CA gives 'YYYY-MM-DD'
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
  // Auth: Vercel Cron sends a header `Authorization: Bearer <CRON_SECRET>`
  // when configured. Also accept manual calls with the same header.
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

  // Idempotency: bail if we've already sent for today (unless force)
  if (!force) {
    const existing = await supabase.from('notification_send_log')
      .select('id').eq('for_date', forDate).limit(1);
    if (!existing.error && existing.data && existing.data.length > 0) {
      return NextResponse.json({ skipped: true, reason: 'already sent for ' + forDate });
    }
  }

  // Pull data
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

  // Build SMS body
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

  // Send to each recipient with a phone
  const sends = await Promise.all(
    recipients.filter(r => r.phone).map(async r => {
      const result = await sendSms(r.phone!, body);
      await supabase.from('notification_send_log').insert({
        for_date: forDate,
        recipient_id: r.id,
        channel: 'sms',
        status: result.success ? 'sent' : 'failed',
        error: result.error ?? null,
        provider_message_id: result.providerMessageId ?? null,
      });
      return { recipient: r.name, ...result };
    })
  );

  // If no recipients had phones, log a single sentinel row so idempotency triggers.
  if (recipients.filter(r => r.phone).length === 0) {
    await supabase.from('notification_send_log').insert({
      for_date: forDate, channel: 'sms', status: 'sent',
      error: 'no recipients with phones — no-op',
    });
  }

  return NextResponse.json({ for_date: forDate, total, taken: takenCount, sends });
}

// Allow GET for manual debugging in browser (with ?secret=... in query)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Reuse POST logic by faking headers
  const fakeReq = new Request(req.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return POST(fakeReq);
}
```

- [ ] **Step 10.4: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/send-daily-summary", "schedule": "0 5 * * *" }
  ]
}
```

(Note: `0 5 * * *` UTC = 10pm MST / 11pm MDT. Acceptable 1hr drift across DST per the spec decision.)

Vercel Cron sends `POST` requests with header `Authorization: Bearer <VERCEL_CRON_SECRET>`. To make our route accept it, set `CRON_SECRET` env var to a random string and configure Vercel Cron to send it (Vercel does this automatically by setting the `CRON_SECRET` env var).

- [ ] **Step 10.5: Set env vars**

The user (Aaron) needs to set the following in Vercel project Settings → Environment Variables (Production + Preview):

- `TWILIO_ACCOUNT_SID` — from Twilio Console
- `TWILIO_AUTH_TOKEN` — from Twilio Console
- `TWILIO_FROM_NUMBER` — Twilio-issued phone number in E.164
- `CRON_SECRET` — generate via `openssl rand -hex 32`

For local dev, add the same to `.env.local`. SMS won't actually fire locally unless `TWILIO_*` vars are set; otherwise the route returns "Twilio env vars missing" per recipient.

- [ ] **Step 10.6: Local route smoke test (without Twilio creds is fine)**

```bash
cd ~/Downloads/neck-armor
echo 'CRON_SECRET=local-dev-test' >> .env.local
npm run dev
```

In another terminal:
```bash
curl -X POST http://localhost:3000/api/send-daily-summary \
  -H "Authorization: Bearer local-dev-test" | jq
```

Expected: 200 with JSON containing `for_date`, `total`, `taken`, `sends`. If no recipients exist, `sends: []`. If recipients exist without phones, no SMS sent. If you set Twilio creds and a real phone in recipients, an actual SMS sends.

Stop dev server.

- [ ] **Step 10.7: Commit**

```bash
git add lib/twilio.ts app/api/send-daily-summary/route.ts vercel.json package.json package-lock.json
git commit -m "feat(meds): /api/send-daily-summary route + Vercel cron

POST sends today's recap as SMS to all active recipients with a phone.
Idempotent per for_date (Denver-local). GET supports manual debug.
Vercel Cron fires at 0 5 * * * UTC (10pm MST / 11pm MDT). Logs every
send (success or failure) to notification_send_log.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Manual resend + last-summary status display + extend wipe

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 11.1: Add the status + resend block to Settings**

Open `app/settings/page.tsx`. Add to imports at top:
```tsx
import { useEffect as useEffect2, useState as useState2 } from 'react';   // (already imported — skip duplicates)
import { supabase } from '@/lib/supabase';   // (already imported)
```

Inside `SettingsPage`, add new state next to the existing state:
```tsx
const [lastSummary, setLastSummary] = useState<{ for_date: string; status: string; error: string | null; sent_at: string } | null>(null);
const [resendBusy, setResendBusy] = useState(false);
const [resendMsg, setResendMsg] = useState<string | null>(null);
```

In the existing useEffect, append a fetch for the latest send_log row:
```tsx
const { data } = await supabase().from('notification_send_log')
  .select('*').order('sent_at', { ascending: false }).limit(1);
if (data && data.length > 0) {
  const r = data[0];
  setLastSummary({ for_date: r.for_date, status: r.status, error: r.error, sent_at: r.sent_at });
}
```

Add the resend handler:
```tsx
const resendNow = async () => {
  setResendBusy(true); setResendMsg(null);
  try {
    const secret = prompt('CRON_SECRET (only needed for local/manual calls — leave empty if Vercel-protected):');
    const res = await fetch('/api/send-daily-summary?force=true', {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const j = await res.json();
    setResendMsg(res.ok ? `Sent: ${j.taken}/${j.total}` : `Error: ${j.error}`);
  } catch (e) {
    setResendMsg('Error: ' + (e as Error).message);
  } finally {
    setResendBusy(false);
  }
};
```

Add a UI block after the existing NOTIFICATIONS section (or merge in there). Insert between the existing "NOTIFICATIONS" block and the new "MEDICINE" block from Task 6:

```tsx
<div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>DAILY RECAP</div>
<div className="rounded-lg p-3 mb-6 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
    {lastSummary
      ? <>Last sent <strong style={{ color: 'var(--text-primary)' }}>{lastSummary.for_date}</strong> · {lastSummary.status}{lastSummary.error ? ` (${lastSummary.error})` : ''}</>
      : 'No summaries sent yet.'}
  </div>
  <button onClick={resendNow} disabled={resendBusy}
    className="w-full py-2 mt-2 text-sm rounded-md font-medium border disabled:opacity-50"
    style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
    {resendBusy ? 'Sending…' : 'Resend today\u2019s summary now'}
  </button>
  {resendMsg && (
    <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{resendMsg}</div>
  )}
</div>
```

- [ ] **Step 11.2: Extend `wipeAll` to clear new tables**

In the same file, find the existing `wipeAll` function. Update its `Promise.all` to delete from the new tables too:

```tsx
await Promise.all([
  supabase().from('app_state').delete().neq('key', ''),
  supabase().from('nutrition_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  supabase().from('medicine_intake_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  supabase().from('medicine_doses').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  supabase().from('medicines').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  supabase().from('notification_send_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  supabase().from('notification_recipients').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
]);
```

(Storage bucket objects are not auto-cleaned — manual cleanup if Reid wipes via this UI. Acceptable for v1.)

- [ ] **Step 11.3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat(meds): daily recap status + manual resend in Settings

Settings shows status of last 10pm SMS run (date + sent/failed +
error if any) with a 'Resend today's summary now' button. wipeAll()
also clears the new medicine + recipient tables.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11.5: Real Web Push notifications (lock-screen pop-ups)

iOS Safari supports Web Push for installed PWAs (16.4+) — Reid must "Add to Home Screen" first. This task adds VAPID-keyed push, a Settings subscribe button, a service-worker push handler, and a Vercel cron that fires per-dose reminders shortly after each dose's scheduled time.

**Files:**
- Create: `supabase/migrations/003_push_subscriptions.sql`
- Modify: `package.json` (add `web-push` + types)
- Create: `lib/push.ts` (client subscribe/unsubscribe)
- Create: `lib/push-server.ts` (server send)
- Create: `app/api/push-subscribe/route.ts`
- Create: `app/api/send-overdue-push/route.ts`
- Modify: `public/sw.js` (push + notificationclick handlers)
- Modify: `app/settings/page.tsx` (replace existing notification button with full subscribe flow)
- Modify: `vercel.json` (add second cron entry)

- [ ] **Step 11.5.1: Migration for push_subscriptions**

```sql
-- supabase/migrations/003_push_subscriptions.sql
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_label text,                      -- e.g. 'Reid iPhone' (free-form)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_active_idx on push_subscriptions(active);

drop trigger if exists push_subscriptions_touch on push_subscriptions;
create trigger push_subscriptions_touch before update on push_subscriptions
for each row execute function touch_app_state();

create table if not exists push_send_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  dose_id uuid references medicine_doses(id) on delete cascade,
  scheduled_date date not null,
  subscription_id uuid references push_subscriptions(id) on delete set null,
  status text not null,                 -- 'sent' | 'failed' | 'expired'
  error text,
  unique(dose_id, scheduled_date, subscription_id)
);
create index if not exists push_send_log_dose_date_idx on push_send_log(dose_id, scheduled_date);

alter table push_subscriptions enable row level security;
alter table push_send_log enable row level security;
drop policy if exists "open_all" on push_subscriptions;
drop policy if exists "open_all" on push_send_log;
create policy "open_all" on push_subscriptions for all using (true) with check (true);
create policy "open_all" on push_send_log for all using (true) with check (true);
```

Apply with `npx supabase db push` or paste in SQL editor. Verify both tables exist.

- [ ] **Step 11.5.2: Generate VAPID keys**

```bash
cd ~/Downloads/neck-armor
npm install web-push
npx web-push generate-vapid-keys
```

Output looks like:
```
=======================================
Public Key:
BLc4xRzKlKORKWlbdz...

Private Key:
nJ4aXt...
=======================================
```

Add both to `.env.local` and to Vercel project env (Production + Preview):
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public>
VAPID_PRIVATE_KEY=<private>
VAPID_SUBJECT=mailto:acave@quickbookstraining.com
```

- [ ] **Step 11.5.3: Install types**

```bash
npm install -D @types/web-push
```

- [ ] **Step 11.5.4: Update `public/sw.js`**

Read the existing file first to preserve cache logic. Append push handlers:

```js
// PUSH NOTIFICATION HANDLERS — appended for medicine reminders
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* */ }
  const title = data.title || 'Reid Cave';
  const options = {
    body: data.body || 'Time to take your meds',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'meds',
    requireInteraction: false,
    data: { url: data.url || '/meds' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/meds';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(url); return w.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
```

(If `sw.js` doesn't already exist or is empty, the above is the full file plus a tiny cache shell — but per README the SW is already there.)

- [ ] **Step 11.5.5: Client-side subscribe helper `lib/push.ts`**

```ts
// lib/push.ts
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
    applicationServerKey: urlBase64ToUint8Array(vapidPub),
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
```

- [ ] **Step 11.5.6: Server send helper `lib/push-server.ts`**

```ts
// lib/push-server.ts — server-only
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
      { TTL: 60 * 30 }     // 30 min — past that, no point pushing the reminder
    );
    return { success: true };
  } catch (e: unknown) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const expired = err.statusCode === 404 || err.statusCode === 410;
    return { success: false, expired, error: err.message || String(e) };
  }
}
```

- [ ] **Step 11.5.7: Push subscribe API route (optional but cleaner)**

The client writes to Supabase directly via anon key (Step 11.5.5 already does this). No server route needed for subscribe — skip the file. (Listed in file map for clarity but not required; remove from file map if you prefer.)

Per the file-map cleanup, remove `app/api/push-subscribe/route.ts` from the new-files list since the client handles subscription directly.

- [ ] **Step 11.5.8: Cron route — `app/api/send-overdue-push/route.ts`**

```ts
// app/api/send-overdue-push/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDoseScheduledOn } from '@/lib/cadence';
import { sendPush } from '@/lib/push-server';
import type { Medicine, MedicineDose, MedicineIntakeLog } from '@/lib/meds-types';
import type { PushSubscriptionRow } from '@/lib/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TZ = 'America/Denver';

function getDenverDateAndTime(now: Date = new Date()): { dateKey: string; hhmm: string } {
  const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return { dateKey: fmtDate.format(now), hhmm: fmtTime.format(now) };  // 'HH:MM'
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

const GRACE_MINUTES = 5;     // wait 5 min after dose time before pushing

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

  // 1. Find scheduled doses for today whose time has passed by GRACE_MINUTES
  // 2. Exclude doses with an intake_log row for today
  // 3. Exclude doses we've already pushed for today (push_send_log)
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
    if (nowMin < doseMin + GRACE_MINUTES) continue;   // not yet overdue past grace
    if (taken.has(dose.id)) continue;                 // already taken
    overdue.push({ dose, med });
  }

  if (overdue.length === 0 || subs.length === 0) {
    return NextResponse.json({ overdue: overdue.length, sent: 0 });
  }

  // For each (dose, subscription), send if not already sent
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
    await supabase.from('push_send_log').insert(insertRows);
  }
  if (expireSubIds.length > 0) {
    await supabase.from('push_subscriptions').update({ active: false }).in('id', expireSubIds);
  }

  return NextResponse.json({ overdue: overdue.length, sent: sends.filter(s => s.ok).length, sends });
}

function hhmm2min(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
```

- [ ] **Step 11.5.9: Update `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/send-daily-summary", "schedule": "0 5 * * *" },
    { "path": "/api/send-overdue-push", "schedule": "*/15 12-4 * * *" }
  ]
}
```

(`*/15 12-4 * * *` UTC ≈ every 15 min from 6am Denver until 10pm Denver. Adjust if Aaron's Vercel plan limits cron frequency.)

- [ ] **Step 11.5.10: Replace existing notifications block in `app/settings/page.tsx`**

Find the existing block titled NOTIFICATIONS (the one that calls `Notification.requestPermission()`). Replace its body with a real subscription flow.

Add to imports near the top:
```tsx
import { subscribeToPush, unsubscribeFromPush, getSubscriptionStatus } from '@/lib/push';
```

Replace the existing `notifStatus` state and `requestPushPermission` function:
```tsx
const [pushStatus, setPushStatus] = useState<string>('checking…');
const [pushBusy, setPushBusy] = useState(false);

useEffect(() => {
  getSubscriptionStatus().then(setPushStatus);
}, []);

const togglePush = async () => {
  setPushBusy(true);
  try {
    if (pushStatus === 'subscribed') {
      await unsubscribeFromPush();
      setPushStatus('unsubscribed');
    } else {
      const result = await subscribeToPush();
      if (!result.ok) {
        alert('Push subscribe failed: ' + result.reason);
        const s = await getSubscriptionStatus(); setPushStatus(s);
      } else {
        setPushStatus('subscribed');
        // Send a quick test notification via the SW
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification('Reid Cave', { body: 'Notifications enabled!', icon: '/icon-192.png' });
        }
      }
    }
  } finally { setPushBusy(false); }
};
```

Update the NOTIFICATIONS rendered block to:
```tsx
<div className="text-[10px] font-medium tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>NOTIFICATIONS</div>
<div className="rounded-lg p-3 mb-6 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
  <div className="text-sm font-medium mb-1 text-app">Med reminders</div>
  <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Status: {pushStatus}</div>
  <button onClick={togglePush} disabled={pushBusy || pushStatus === 'unsupported' || pushStatus === 'denied'}
    className="w-full py-2 text-sm rounded-md font-medium disabled:opacity-50"
    style={{
      background: pushStatus === 'subscribed' ? 'var(--accent-red-bg)' : 'var(--text-primary)',
      color: pushStatus === 'subscribed' ? 'var(--accent-red)' : 'var(--bg-primary)',
      border: pushStatus === 'subscribed' ? '1px solid var(--accent-red-border)' : 'none',
    }}>
    {pushBusy ? '…' : pushStatus === 'subscribed' ? 'Disable reminders' : 'Enable reminders'}
  </button>
  <div className="text-[10px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
    iPhone: must Add to Home Screen first (Share → Add to Home Screen), then open from the home-screen icon.
  </div>
</div>
```

Remove the obsolete `notifStatus` state, its `useEffect`, `requestPushPermission`, and the old NOTIFICATIONS block JSX.

- [ ] **Step 11.5.11: Extend wipeAll for new tables**

In the same file, the `wipeAll` Promise.all needs the new tables:
```tsx
supabase().from('push_send_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
supabase().from('push_subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
```

Append these two lines to the existing `wipeAll` Promise.all block.

- [ ] **Step 11.5.12: Smoke test locally**

```bash
cd ~/Downloads/neck-armor
npm run dev
```

In a desktop browser (Chrome/Edge — Safari won't subscribe for non-installed sites):
1. Open http://localhost:3000/settings → Enable reminders → grant permission → see "Notifications enabled!" toast
2. Verify Supabase Studio → `push_subscriptions` has 1 active row
3. From a terminal, hit the cron route:
```bash
curl -X POST http://localhost:3000/api/send-overdue-push \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" | jq
```
4. If you have a med scheduled with a time >5min in the past for today, you should receive a browser notification.

For iOS test: deploy to Vercel, install PWA on iPhone via Add to Home Screen, then run through the same flow.

- [ ] **Step 11.5.13: Commit**

```bash
git add supabase/migrations/003_push_subscriptions.sql lib/push.ts lib/push-server.ts \
  app/api/send-overdue-push public/sw.js app/settings/page.tsx vercel.json \
  package.json package-lock.json
git commit -m "feat(meds): real Web Push for overdue dose reminders

VAPID-keyed Web Push. Settings page subscribes the device, stores
the subscription in Supabase. Service worker handles push events
with notificationclick deep-link to /meds. Vercel Cron at */15 min
during waking hours fires push for any dose past its time + 5min
grace, dedupe by (dose, date, subscription). Expired subscriptions
are auto-deactivated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: Seed initial medicines + upload photos

This task is best done after Aaron has placed cleaned-up images in `~/Downloads/meds/fixed/` and after the Manage Medicines UI is verified working in production (or local dev with real Supabase).

**Files:**
- Create: `scripts/seed-medicines.ts` (one-shot seed script)

- [ ] **Step 12.1: Read all original Rx photos to identify medicines**

Use the Read tool on each `~/Downloads/meds/IMG_*.jpeg` to extract the printed medication name from the Rx label. Make a list of `{ name, purpose, instructions, photo_filename, doses }`. Confirm with Aaron before scripting.

- [ ] **Step 12.2: Aaron places cleaned PNGs in `~/Downloads/meds/fixed/`**

Coordinate with Aaron — he has indicated he will do this himself (background-removed). Filenames should match the original IMG_NNNN.jpeg (PNG ext), or any consistent naming Aaron prefers.

Confirm filename → medicine mapping with Aaron before proceeding.

- [ ] **Step 12.3: Write seed script**

```ts
// scripts/seed-medicines.ts
// One-shot: reads ~/Downloads/meds/fixed/*.png and inserts medicines
// + doses into Supabase. Run once from a terminal with env vars loaded:
//   npx tsx scripts/seed-medicines.ts
//
// CONFIRMED with Aaron — fill in the SEEDS array below from the
// IMG_*.jpeg → medicine mapping he provided.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const FIXED_DIR = path.join(process.env.HOME!, 'Downloads', 'meds', 'fixed');

type Seed = {
  filename: string;          // e.g. 'IMG_5253.png'
  name: string;
  purpose: string;
  instructions: string;
  doses: Array<{
    time_of_day: string;     // 'HH:MM'
    cadence: 'daily' | 'weekdays' | 'custom_days' | 'every_n_days';
    days_of_week?: number[];
    interval_days?: number;
    start_date?: string;
    label?: string;
  }>;
};

// FILL THIS IN with confirmed mapping. Example below.
const SEEDS: Seed[] = [
  // {
  //   filename: 'IMG_5253.png',
  //   name: 'Terbinafine 250mg',
  //   purpose: 'Antifungal — for skin/nail fungus (12-week course)',
  //   instructions: '1 tablet by mouth, with food',
  //   doses: [{ time_of_day: '07:00', cadence: 'daily' }],
  // },
];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  for (const s of SEEDS) {
    const filePath = path.join(FIXED_DIR, s.filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[seed] file not found: ${filePath} — skipping`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(s.filename).slice(1) || 'png';
    const storagePath = `${randomUUID()}.${ext}`;

    // Upload
    const up = await supabase.storage.from('medicine-images').upload(storagePath, buf, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: false,
    });
    if (up.error) { console.error(`[seed] upload failed: ${s.filename}: ${up.error.message}`); continue; }
    console.log(`[seed] uploaded ${s.filename} → ${storagePath}`);

    // Insert medicine
    const ins = await supabase.from('medicines').insert({
      name: s.name, purpose: s.purpose, instructions: s.instructions,
      image_path: storagePath, active: true,
    }).select().single();
    if (ins.error) { console.error(`[seed] medicine insert failed: ${s.name}: ${ins.error.message}`); continue; }
    const medId = ins.data.id;
    console.log(`[seed] inserted medicine ${s.name} (${medId})`);

    // Insert doses
    const doseRows = s.doses.map(d => ({
      medicine_id: medId,
      time_of_day: d.time_of_day,
      cadence: d.cadence,
      days_of_week: d.cadence === 'weekdays' ? [1,2,3,4,5] : d.days_of_week ?? null,
      interval_days: d.interval_days ?? null,
      start_date: d.start_date ?? null,
      label: d.label ?? null,
    }));
    const dIns = await supabase.from('medicine_doses').insert(doseRows);
    if (dIns.error) { console.error(`[seed] dose insert failed: ${s.name}: ${dIns.error.message}`); continue; }
    console.log(`[seed] inserted ${doseRows.length} dose(s) for ${s.name}`);
  }
  console.log('[seed] done');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 12.4: Install tsx (TypeScript exec) if missing**

```bash
npm install -D tsx
```

- [ ] **Step 12.5: Aaron fills in `SEEDS` array, then runs**

Edit `scripts/seed-medicines.ts` — replace the empty `SEEDS = []` with the confirmed list. Then:
```bash
cd ~/Downloads/neck-armor
node --env-file=.env.local --import tsx scripts/seed-medicines.ts
# OR if --import flag isn't supported on your Node:
npx dotenv -e .env.local -- npx tsx scripts/seed-medicines.ts
```

(`dotenv-cli` is `npm install -D dotenv-cli` if needed.)

Verify in Supabase Studio → Table Editor → `medicines` that all rows are present. Open the app, navigate to /meds, confirm photos render.

- [ ] **Step 12.6: Commit (with seed array empty if Aaron's mapping isn't ready)**

```bash
git add scripts/seed-medicines.ts package.json package-lock.json
git commit -m "feat(meds): seed script for medicine table

One-shot script to upload cleaned-up Rx photos from
~/Downloads/meds/fixed/ and insert matching medicine + dose rows.
Aaron fills in the SEEDS array from the IMG -> medicine mapping
before running. Idempotency = re-running creates duplicate rows,
so run once.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Final smoke test checklist

After all tasks complete, run through this end-to-end:

- [ ] **Migration applied** — query Supabase Studio shows all 5 new tables + `medicine-images` bucket exists (private)
- [ ] **`npm test`** passes (12 cadence tests)
- [ ] **`npm run build`** succeeds with no type errors
- [ ] **Bottom nav** shows Pill icon on the Meds tab; tapping it navigates to /meds
- [ ] **Empty state** on /meds tells user to add via Settings
- [ ] **Settings → Manage Medicines** allows adding a med with a photo (camera or library), 2 doses (morning + bedtime), and saving — list updates
- [ ] **Edit existing med** preserves dose IDs and updates fields
- [ ] **Delete med** removes from list (and Storage)
- [ ] **/meds page** shows the just-created med with photo at the right time-of-day group
- [ ] **Tap checkbox** logs intake; row turns green; long-press undoes
- [ ] **Force "now" past 8am** by setting a dose to 06:00 (already past) — overdue banner appears, red border on card
- [ ] **History → Meds** calendar grid colors today appropriately
- [ ] **Home page** Meds streak card shows expected number
- [ ] **Settings → Notification Recipients** add Dad/Mom/Reid with E.164 phones — saved
- [ ] **POST /api/send-daily-summary** with `Authorization: Bearer $CRON_SECRET` returns 200, logs row in send_log; check Twilio console (or recipients' phones) for SMS
- [ ] **Resend today's summary** button in Settings re-fires the cron route and updates the status display

---

## Deployment checklist

- [ ] All env vars set in Vercel: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`
- [ ] `vercel.json` cron entry deployed (check Vercel dashboard → Cron Jobs)
- [ ] First scheduled run logs to `notification_send_log` and arrives by SMS
- [ ] Reid adds the production URL to Home Screen on his iPhone (re-confirm — required for PWA install)
