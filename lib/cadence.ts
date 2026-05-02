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
