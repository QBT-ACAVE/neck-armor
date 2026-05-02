-- supabase/migrations/004_medicine_prn.sql
-- PRN ("as needed") medicines: no schedule, no overdue, optional intake logging.

-- ─── medicines.is_prn ─────────────────────────────────────────────
alter table medicines
  add column if not exists is_prn boolean not null default false;

create index if not exists medicines_is_prn_idx on medicines(is_prn) where is_prn = true;

-- ─── medicine_intake_log: allow PRN intakes (no dose row) ─────────
alter table medicine_intake_log alter column dose_id drop not null;

alter table medicine_intake_log
  add column if not exists medicine_id uuid references medicines(id) on delete cascade;

create index if not exists medicine_intake_log_medicine_idx
  on medicine_intake_log(medicine_id, scheduled_date);

-- Either dose_id (scheduled intake) or medicine_id (PRN intake) must be set.
alter table medicine_intake_log drop constraint if exists intake_log_target;
alter table medicine_intake_log
  add constraint intake_log_target check (
    (dose_id is not null) or (medicine_id is not null)
  );
