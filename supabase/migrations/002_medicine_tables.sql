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
create index if not exists notification_send_log_recipient_idx on notification_send_log(recipient_id);

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
  begin alter publication supabase_realtime add table medicines;
    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table medicine_doses;
    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table medicine_intake_log;
    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table notification_recipients;
    exception when duplicate_object then null; end;
end $$;
