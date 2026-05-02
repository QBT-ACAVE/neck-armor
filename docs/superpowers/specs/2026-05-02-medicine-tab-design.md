# Medicine Tab — Design Spec

**Date:** 2026-05-02
**Status:** Draft, pending user review
**Author:** Aaron Cave + Claude
**Target app:** `neck-armor` (Reid's PWA)

## Goal

Add a medicine-tracking tab so Reid can see what to take, when, and what for; check off doses as he takes them; review history; and have the household receive a daily 10pm SMS recap. Schedule supports varying cadences (daily / specific weekdays / every-N-days). Editable in-app by parents.

Single user (Reid). Single timezone (America/Denver). v1 uses in-app visual reminders only — real push notifications are explicitly deferred.

## Non-goals (v1)

- Real OS-level push notifications (in-app visual reminders only — server push deferred to v2)
- Multi-timezone / travel handling
- PRN / as-needed medicines (everything is on a fixed schedule)
- Email summaries (SMS only — schema leaves room for email later)
- Late vs on-time distinction (binary taken/missed only)
- Multi-user / per-athlete profiles

## User stories

1. **Reid (daily):** opens Meds tab, sees today's doses grouped by time-of-day, taps a checkbox after taking each.
2. **Reid (review):** opens History → Meds, sees a calendar grid of past days color-coded by adherence.
3. **Parent (setup/maintenance):** opens Settings → Manage Medicines, adds a new med with name, purpose, instructions, photo, and one or more scheduled doses.
4. **Parent (audit):** receives a daily SMS at 10:00pm summarizing what Reid took / missed.
5. **Parent (recipients):** edits the SMS recipient list in-app (Settings → Notification Recipients) without a redeploy.

## Architecture

### Data model

Three new Supabase tables + one new Storage bucket. Single migration file.

#### `medicines`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `name` | text not null | e.g. "Terbinafine 250mg" |
| `purpose` | text | what it's for, e.g. "Antifungal — for skin/nail fungus" |
| `instructions` | text | how to take/apply, e.g. "Take with food. Avoid antacids within 2 hrs." |
| `image_path` | text | Supabase Storage path within `medicine-images` bucket. Nullable. |
| `active` | bool not null default true | false = paused, hidden from daily list, history preserved |
| `display_order` | int not null default 0 | manual ordering in admin & daily list |
| `created_at` | timestamptz not null default now() | |
| `updated_at` | timestamptz not null default now() | trigger updates this on UPDATE |

#### `medicine_doses`
One row per scheduled dose. A medicine taken twice daily = 2 rows.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `medicine_id` | uuid fk → medicines(id) on delete cascade | |
| `time_of_day` | time not null | e.g. `'07:00'` |
| `cadence` | enum (`daily`, `weekdays`, `custom_days`, `every_n_days`) not null | |
| `days_of_week` | int[] | used when cadence=`weekdays` (always `{1,2,3,4,5}`) or `custom_days` (subset of 0–6, 0=Sun). Null for daily/every_n_days. |
| `interval_days` | int | used when cadence=`every_n_days`. Null otherwise. |
| `start_date` | date | anchor for `every_n_days`. Defaults to medicine.created_at::date. |
| `label` | text | optional human label, e.g. "Morning". Defaults computed from time_of_day. |
| `created_at`, `updated_at` | timestamptz | |

**Cadence semantics:**
- `daily` → fires every day
- `weekdays` → Mon–Fri
- `custom_days` → fires on listed weekdays
- `every_n_days` → fires on dates where `(date - start_date) % interval_days == 0`

#### `medicine_intake_log`
One row per "checked off" event.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `dose_id` | uuid fk → medicine_doses(id) on delete cascade | |
| `scheduled_date` | date not null | the calendar date the dose was due |
| `taken_at` | timestamptz not null default now() | when Reid tapped check |
| `notes` | text | optional |
| `created_at` | timestamptz not null default now() | |

**Unique constraint:** `(dose_id, scheduled_date)` — can't double-log the same dose on the same day.

#### `notification_recipients`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | "Dad", "Mom", "Reid" |
| `phone` | text | E.164 format, nullable (so we can later add email-only recipients) |
| `email` | text | nullable, reserved for v2 |
| `active` | bool not null default true | |
| `created_at`, `updated_at` | timestamptz | |

#### `notification_send_log`
For debugging the 10pm cron.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `sent_at` | timestamptz not null default now() | |
| `for_date` | date not null | the date the summary covers |
| `recipient_id` | uuid fk → notification_recipients(id) on delete set null | |
| `channel` | text not null | `'sms'` for v1; `'email'` reserved |
| `status` | text not null | `'sent'` / `'failed'` |
| `error` | text | populated on failure |
| `provider_message_id` | text | Twilio's SID, when available |

### Storage bucket

**`medicine-images`** — private bucket (NOT public-read). Photos contain real Rx labels with name + RX number, so the bucket lives behind signed URLs. App generates signed URLs on demand (1-hour expiry, refreshed on read).

Filenames: random UUIDs (no semantic name), original extension preserved. Size cap enforced client-side at 2MB pre-upload; recommend <500KB after rembg processing.

### Row-Level Security

All tables enable RLS. The app uses Supabase's anon key. Since this is a single-user app with no auth, the policies are:
- `medicines`, `medicine_doses`, `medicine_intake_log`, `notification_recipients` — full read/write to anon role.
- `notification_send_log` — read/write to anon (so the cron route can write via service role; anon read is OK for debugging UI).
- Storage bucket `medicine-images` — read/write to anon, but objects served only via signed URLs.

This matches the existing `app_state` table's permissive model. The whole app is "whoever has the URL" — same threat model as before.

### File layout

```
app/
  meds/page.tsx                         -- daily checklist (the main UI Reid sees)
  meds/components/
    MedCard.tsx                          -- one med card with photo, name, checkbox
    DoseGroup.tsx                        -- groups doses by time-of-day window
    OverdueBanner.tsx                    -- sticky banner above the list
  history/meds/page.tsx                  -- calendar grid + day detail
  settings/manage-meds/page.tsx          -- admin: list + add/edit forms
  settings/manage-meds/[id]/page.tsx     -- single med edit form
  settings/recipients/page.tsx           -- notification recipients admin
  api/send-daily-summary/route.ts        -- cron-triggered SMS sender
lib/
  meds.ts                                -- all medicine queries + scheduling logic
  meds-types.ts                          -- TS types matching DB
  twilio.ts                              -- thin wrapper around Twilio SMS send
  cadence.ts                             -- pure-function: "is this dose scheduled on date D?"
supabase/
  migrations/
    YYYYMMDDHHMMSS_medicine_tables.sql   -- creates all tables, indexes, triggers, bucket
vercel.json                              -- adds cron entry for /api/send-daily-summary
```

### Bottom navigation

Currently 7 tabs. Adding one more (Meds) makes 8 — risk of getting cramped on iPhone SE width. Plan: add Meds, evaluate spacing during implementation, possibly fold one less-used existing tab into a "More" overflow if needed.

## UI flows

### Daily Meds tab

Layout: scroll list of dose-time groups, each group is a header (`Morning · 7:00am`) + cards.

Each card:
- Left: 64×64 rounded-square thumbnail of the medicine photo (signed URL, lazy-loaded)
- Middle: med name (semibold), one-line summary of dose + instructions ("1 tablet, with food")
- Right: large tappable checkbox

Tap checkbox → soft haptic, optimistic UI update + insert into `medicine_intake_log`. Follows the existing app's cache-then-flush pattern (see `lib/storage.ts`): localStorage cache updates instantly, Supabase write debounced/awaited in background. Checkbox flips to filled state. No confirmation modal. Photo uploads use the Supabase JS client directly (no Next.js API route needed).

Long-press a checked card → "Undo" action sheet → deletes intake_log row.

Tap card body (anywhere except checkbox) → expands inline to show full purpose + instructions.

Visual state per card:
- **Upcoming** (time hasn't arrived): default styling
- **Due now** (within window): subtle highlight
- **Overdue** (time passed, not checked): red border + red checkbox outline
- **Taken**: green checkbox, slight fade on the rest of the card
- **Missed** (after midnight, not taken): grayed out, "missed" badge

### Manage Medicines (Settings)

Settings page gets a new section with two buttons: "Manage Medicines" and "Notification Recipients."

**Manage Medicines list page:** all medicines (active + paused, paused shown grayed). Tap "+" to add, tap a row to edit.

**Edit form:**
- Photo: tap to upload (camera or library on phone, file picker on desktop). Shows current photo with "Replace" button.
- Name (required)
- What it's for (textarea)
- How to take (textarea)
- Doses section: list of dose rows, each with time picker + cadence picker. "+ Add dose" button.
- Cadence picker UI:
  - "Every day" (daily)
  - "Weekdays only" (weekdays)
  - "Specific days" — checkboxes for Sun–Sat (custom_days)
  - "Every N days" — number input + "starting on" date picker
- Active toggle (switch)
- Display order (drag-handle reorder on list page, not in edit form)
- Delete button (confirms; cascades to intake_log)

### History → Meds

Sub-tab inside the existing History page. Calendar grid (same component shape as workout calendar) showing the current month + month nav.

Each cell color:
- **Green:** all scheduled doses for that day were logged
- **Yellow:** some logged, some missed
- **Red:** at least one dose scheduled, none logged
- **Gray:** no doses scheduled
- **Today:** outlined regardless of color

Tap a day → bottom sheet listing each scheduled dose with ✓ or ✗ marker.

### Notification Recipients (Settings)

List of recipients with name + phone. Tap to edit, "+" to add. Form: name, phone (with E.164 formatter), active toggle.

Initial seed: Dad, Mom, Reid (parents fill in numbers on first run).

### Streak integration

Existing streak summary updated:
- A "good day" requires both workout-completion (existing rule) AND meds-completion (every scheduled dose logged by midnight).
- Add a separate "Meds streak" pill so a missed med doesn't silently break the combined streak with no signal.

Implementation: existing streak computation reads from intake_log via the same scheduling join used by the summary cron.

## 10pm SMS summary

### Trigger

`vercel.json` cron entry:
```json
{ "path": "/api/send-daily-summary", "schedule": "0 22 * * *" }
```

Schedule string is UTC in Vercel. America/Denver = UTC-6 (MDT) or UTC-7 (MST). To fire at 10pm local year-round, the route should determine "today" in America/Denver from the request time, NOT depend on the schedule firing at exactly 22:00 local. Run the cron at, say, `0 4 * * *` UTC (10pm MDT / 9pm MST) and accept that during MST it fires at 9pm. Or run twice (4 and 5 UTC) and idempotency-guard — only first run per local date sends.

**Decision:** Run the cron at `0 5 * * *` UTC (10pm MST / 11pm MDT). The 1-hour drift in summer is acceptable for a daily recap. Idempotency: route checks `notification_send_log` for any row with `for_date = today_in_denver` and bails if found. Manual re-send button overrides this.

### Route logic

```
POST /api/send-daily-summary
Authorization: Bearer ${CRON_SECRET}
```

1. Verify `CRON_SECRET`. Reject 401 otherwise.
2. Compute `for_date` = today in America/Denver.
3. Idempotency: SELECT from `notification_send_log` WHERE `for_date = $1`. If any rows → return 200 with `{ skipped: true, reason: "already sent" }` unless `force=true` query param.
4. Query: scheduled doses for today (using cadence join) + intake_log for today. Result is a list of `{ med_name, time_of_day, taken: bool }`.
5. Format the SMS body.
6. SELECT from `notification_recipients` WHERE `active = true AND phone IS NOT NULL`.
7. For each recipient: call Twilio API. On success/failure, write to `notification_send_log`.
8. Return 200 with summary of sends.

### SMS format

All taken:
```
Reid's meds — Fri May 2
✓ Terbinafine (7am)
✓ Allegra (7am)
✓ Melatonin (8pm)
3/3 ✓ — streak: 14 days 🔥
```

Some missed:
```
Reid's meds — Fri May 2
✓ Terbinafine (7am)
⚠ Allegra (7am) — MISSED
✓ Melatonin (8pm)
2/3 — streak broken
```

If body exceeds 160 chars Twilio splits into multiple SMS automatically. With 3-5 meds and short names this won't happen.

### Manual resend

Settings page gets a "Resend today's summary" button. Calls the same route with `?force=true`. Useful when something went wrong or recipients want a re-check.

### Twilio config

Vercel env vars:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` (Twilio-issued, E.164)
- `CRON_SECRET` (random string)
- `SUPABASE_SERVICE_ROLE_KEY` (for the cron route to write to send_log; not exposed to client)

Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` already in place.

## In-app reminders (v1)

No real OS push. Implementation:

- Bottom-nav "Meds" tab gets a red dot when any of today's already-due-and-not-taken doses exist (computed client-side on every render of the tab).
- Sticky banner at top of Meds tab when overdue doses exist: "⚠ 1 dose overdue — Allegra was due at 7:00am" (compact, dismissible only by checking the dose).
- After 8pm bedtime window passes with anything missed: banner switches to "Today: 2/3 taken — finish before midnight to keep your streak."
- After midnight: missed doses lock in. The day rolls over.

## Edge cases and rules

- **Late check-off after midnight.** Disallowed in normal flow. Admin escape hatch: Manage Medicines → "Edit history" lets parents add/remove intake_log rows for past dates. (Punt to v1.5 if low-value.)
- **Adding a new medicine mid-day.** If a dose's `time_of_day` is already past at creation, today's not counted as missed for that medicine — start tracking tomorrow. Implementation: compare `medicine.created_at` to the dose's would-be scheduled datetime when computing `is_missed`.
- **Pausing a med.** `active = false` excludes from daily list and from cron's "scheduled today" query. History intact. Editing is allowed while paused.
- **Editing time_of_day on an existing dose.** intake_log rows already keyed by `(dose_id, scheduled_date)` — they remain valid. Today's not-yet-taken row uses the new time. No retroactive rewrite.
- **Editing cadence on an existing dose.** Same — going forward only. Past intake_log untouched.
- **Deleting a medicine.** `ON DELETE CASCADE` removes doses and intake_log. UI confirms with explicit "this will erase X days of history."
- **Missed cron run.** Vercel skips happen rarely. We don't backfill yesterday's SMS. Manual resend covers it.
- **Twilio failure.** Log error per recipient, continue with the rest. Don't auto-retry. Manual resend if needed.
- **Twilio billing surprise.** Free trial credits run out. Failure surfaces in Settings via a "last summary" status indicator that shows the result of the most recent cron run.
- **Reid clears Safari data.** Supabase is source of truth. Re-hydration restores everything (matches existing app behavior).
- **Photo upload size.** Client-side enforcement: reject >5MB, recommend <500KB post-processing. Bucket has no server-side cap configured.
- **Daylight saving transitions.** Cron runs at fixed UTC. Drift of 1 hour twice a year. Acceptable.

## Implementation phases

Suggested ordering for the writing-plans step:

1. **DB migration** + Supabase Storage bucket setup
2. **Cadence pure-function library** (`lib/cadence.ts`) with unit tests
3. **`lib/meds.ts` data layer** — queries for today's doses, intake logs, history calendar
4. **Daily Meds tab** (read-only, then add check-off)
5. **Manage Medicines admin** — list, add, edit (with photo upload), pause, delete
6. **Notification Recipients admin**
7. **History → Meds sub-tab** (calendar + day detail)
8. **Streak integration**
9. **In-app overdue banner + nav red dot**
10. **`/api/send-daily-summary` route + Twilio + cron entry + idempotency**
11. **Manual resend button + send_log status display**
12. **Seed data** — pre-populate medicines from `~/Downloads/meds/fixed/` photos and known Rx info

## Future work (v2+)

- Real push notifications (VAPID keys + push subscription + cron-driven dose-level pings)
- Email channel alongside SMS
- Multi-timezone / travel mode
- PRN / as-needed meds with per-event logging
- Late vs on-time tri-state (with configurable grace window per dose)
- Multi-user support (other athletes / siblings)
- Refill tracking ("running low — request refill")
- Side effect / symptom journal
- Dosage history charts

## Open questions

None blocking. Resolved during brainstorm:
- ✓ Schedule: specific times per dose, varying cadence supported
- ✓ Editing: in-app admin, photos uploaded
- ✓ Reminders: in-app visual only for v1 (no real push)
- ✓ Summary channel: SMS via Twilio
- ✓ State model: binary taken/missed
- ✓ Streak rule: all scheduled doses logged by midnight = good day
- ✓ Recipients: Dad, Mom, Reid (3 numbers, configurable in-app)
- ✓ PRN: not in v1, all meds scheduled
- ✓ Storage: private bucket, signed URLs (Rx labels contain PHI)
- ✓ Architecture: relational tables, not JSON blobs
