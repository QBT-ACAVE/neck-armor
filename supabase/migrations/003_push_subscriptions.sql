-- supabase/migrations/003_push_subscriptions.sql
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_label text,
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
  status text not null,
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
