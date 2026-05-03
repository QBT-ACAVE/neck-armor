// lib/meds.ts
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
  const { data: meds, error: medsErr } = await supabase()
    .from('medicines').select('*').eq('active', true).order('display_order');
  if (medsErr) throw medsErr;
  const medicines = (meds ?? []) as Medicine[];
  if (medicines.length === 0) return { medicines, doses: [] };
  const { data: doses, error: dosesErr } = await supabase()
    .from('medicine_doses').select('*').in('medicine_id', medicines.map(m => m.id));
  if (dosesErr) throw dosesErr;
  return { medicines, doses: (doses ?? []) as MedicineDose[] };
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
  if (incomingIds.length > 0) del = del.not('id', 'in', `(${incomingIds.join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw delErr;
  // Upsert each
  if (doses.length > 0) {
    const rows = doses.map(d => {
      const row: Record<string, unknown> = { ...d, medicine_id: medicineId };
      if (!row.id) delete row.id;
      return row;
    });
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

export type ImageTransform = { width?: number; height?: number; quality?: number };

export async function getSignedImageUrl(
  path: string, transform?: ImageTransform,
): Promise<string> {
  const { data, error } = await supabase().storage
    .from('medicine-images')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, transform ? { transform } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function getSignedImageUrls(
  paths: string[], transform?: ImageTransform,
): Promise<Record<string, string>> {
  const valid = paths.filter(Boolean);
  if (valid.length === 0) return {};

  // createSignedUrls (batched) doesn't accept transform — use singular calls in parallel.
  // Tolerate per-file failures (stale image_path → "object not found") so one bad row
  // doesn't blow up the whole page; the card falls back to its placeholder.
  if (transform) {
    const results = await Promise.allSettled(
      valid.map(async (p) => [p, await getSignedImageUrl(p, transform)] as const)
    );
    const out: Record<string, string> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [p, url] = r.value;
        out[p] = url;
      } else {
        console.warn('[meds] signed-url failed:', r.reason?.message ?? r.reason);
      }
    }
    return out;
  }

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

// ─── PRN ("as needed") medicines ─────────────────────────────────

export async function fetchActivePrnMedicines(): Promise<Medicine[]> {
  const { data, error } = await supabase()
    .from('medicines').select('*')
    .eq('active', true).eq('is_prn', true).order('display_order');
  if (error) throw error;
  return (data ?? []) as Medicine[];
}

export async function fetchPrnIntakesForDate(dateKey: string): Promise<MedicineIntakeLog[]> {
  const { data, error } = await supabase()
    .from('medicine_intake_log').select('*')
    .eq('scheduled_date', dateKey).is('dose_id', null);
  if (error) throw error;
  return (data ?? []) as MedicineIntakeLog[];
}

export async function logPrnIntake(medicineId: string, dateKey: string = localDateKey()): Promise<MedicineIntakeLog> {
  const { data, error } = await supabase()
    .from('medicine_intake_log')
    .insert({ medicine_id: medicineId, scheduled_date: dateKey, taken_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data as MedicineIntakeLog;
}

// ─── Day color (calendar) ────────────────────────────────────────

export type DayColor = 'green' | 'yellow' | 'red' | 'neutral';

/**
 * Color for a given past date, given the medicine/dose/log dataset.
 * PRN medicines are excluded from the expected count (they have no doses).
 * 0 missed → green, 1 missed → yellow, 2+ missed → red.
 * 0 expected (no doses scheduled that day yet) → neutral.
 */
export function medsDayColor(
  date: Date,
  medicines: Medicine[],
  doses: MedicineDose[],
  logs: MedicineIntakeLog[],
): DayColor {
  const medById = new Map(medicines.map(m => [m.id, m]));
  const dateKey = localDateKey(date);
  let scheduled = 0;
  let taken = 0;
  for (const dose of doses) {
    const med = medById.get(dose.medicine_id);
    if (!med || med.is_prn) continue;
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    scheduled++;
    if (logs.some(l => l.dose_id === dose.id && l.scheduled_date === dateKey)) taken++;
  }
  if (scheduled === 0) return 'neutral';
  const missed = scheduled - taken;
  if (missed === 0) return 'green';
  if (missed === 1) return 'yellow';
  return 'red';
}

// ─── Day detail (calendar tap) ───────────────────────────────────

export type MedsDayDetailItem =
  | { kind: 'scheduled'; medicine: Medicine; dose: MedicineDose; taken: boolean; takenAt: string | null }
  | { kind: 'prn'; medicine: Medicine; takenAt: string };

export function buildMedsDayDetail(
  date: Date,
  medicines: Medicine[],
  doses: MedicineDose[],
  logs: MedicineIntakeLog[],
): MedsDayDetailItem[] {
  const dateKey = localDateKey(date);
  const medById = new Map(medicines.map(m => [m.id, m]));
  const items: MedsDayDetailItem[] = [];

  for (const dose of doses) {
    const med = medById.get(dose.medicine_id);
    if (!med || med.is_prn) continue;
    const created = new Date(med.created_at);
    if (!isDoseScheduledOn(dose, date, { notBefore: created })) continue;
    const log = logs.find(l => l.dose_id === dose.id && l.scheduled_date === dateKey);
    items.push({
      kind: 'scheduled', medicine: med, dose,
      taken: !!log, takenAt: log?.taken_at ?? null,
    });
  }

  for (const log of logs) {
    if (log.scheduled_date !== dateKey) continue;
    if (log.dose_id !== null) continue;             // scheduled, already handled above
    if (!log.medicine_id) continue;
    const med = medById.get(log.medicine_id);
    if (!med) continue;
    items.push({ kind: 'prn', medicine: med, takenAt: log.taken_at });
  }

  items.sort((a, b) => {
    if (a.kind === 'scheduled' && b.kind === 'scheduled') {
      return a.dose.time_of_day.localeCompare(b.dose.time_of_day);
    }
    if (a.kind === 'scheduled') return -1;
    if (b.kind === 'scheduled') return 1;
    return a.takenAt.localeCompare(b.takenAt);
  });
  return items;
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
  const logSet = new Set(logs.map(l => `${l.dose_id}|${l.scheduled_date}`));

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

  // Floor: the earliest medicine creation date — before any med existed, a "streak" is meaningless
  // and would otherwise walk backward forever via the no_doses → continued-streak rule.
  const earliestCreated = medicines.length === 0
    ? null
    : medicines.reduce((min, m) => {
        const c = new Date(m.created_at);
        return min === null || c < min ? c : min;
      }, null as Date | null);

  // Anchor: today must qualify, or fall back to yesterday (so "haven't taken today yet" doesn't break the streak).
  const cursor = parseDateKey(today);
  if (!qualifies(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!qualifies(cursor)) return 0;
  }
  let streak = 0;
  while (qualifies(cursor)) {
    if (earliestCreated && cursor < earliestCreated) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
