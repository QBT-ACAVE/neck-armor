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
