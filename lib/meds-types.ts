// lib/meds-types.ts
import type { CadenceKind } from './cadence';

export type Medicine = {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  image_path: string | null;
  active: boolean;
  is_prn: boolean;
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
  dose_id: string | null;       // null = PRN intake (use medicine_id)
  medicine_id: string | null;   // set only for PRN intakes
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
