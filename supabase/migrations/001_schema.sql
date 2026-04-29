-- Neck Armor — Supabase schema
-- Single user (Reid). No auth. Open RLS.
-- Strategy: store existing JSON shapes (Progress, ExerciseHistory, Catches, Settings)
-- as JSONB rows in `app_state`. Nutrition gets its own normalized table.

-- ─── 1. KEY/VALUE STATE TABLE ─────────────────────────────────────
-- One row per "key": progress, history, catches, settings
-- Mirrors localStorage 1:1 — the existing storage.ts code shape stays intact.
create table if not exists app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function touch_app_state() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists app_state_touch on app_state;
create trigger app_state_touch before update on app_state
for each row execute function touch_app_state();

-- ─── 2. NUTRITION (normalized — better for queries/streaks) ───────
create table if not exists nutrition_log (
  id uuid default gen_random_uuid() primary key,
  log_date date not null default current_date,
  item_key text not null check (item_key in (
    'shake_1','shake_2',
    'breakfast','lunch','dinner','snack_1','snack_2',
    'creatine','allergy','vitamin_d'
  )),
  completed_at timestamptz not null default now(),
  unique(log_date, item_key)
);
create index if not exists nutrition_log_date_idx on nutrition_log(log_date desc);

-- ─── RLS: open access (single-user app) ───────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array['app_state','nutrition_log'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "open_all" on %I', t);
    execute format('create policy "open_all" on %I for all using (true) with check (true)', t);
  end loop;
end$$;

-- ─── Realtime (optional, for cross-device live sync) ──────────────
alter publication supabase_realtime add table app_state;
alter publication supabase_realtime add table nutrition_log;
