import { env } from '../config/env';

/**
 * Date handling.
 *
 * Everything is stored as UTC `DateTime`. School days are *calendar* days in the
 * school's timezone, so all day-boundary logic goes through these helpers rather
 * than `toISOString().slice(0,10)` (which silently uses UTC and breaks for
 * Asia/Jakarta at 00:00-07:00 local).
 */

export const SCHOOL_TIMEZONE = env.TIMEZONE;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` for the given instant in the school timezone. */
export function toSchoolDateKey(instant: Date = new Date()): string {
  return dateFormatter.format(instant);
}

/** `YYYY-MM-DD` of a stored calendar date (already midnight UTC by convention). */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses `YYYY-MM-DD` into midnight UTC; throws on impossible dates. */
export function parseDateKey(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Tanggal tidak valid: ${key}`);
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) {
    throw new Error(`Tanggal tidak valid: ${key}`);
  }
  return date;
}

/** Today's calendar day key in the school timezone. */
export function todayKey(now: Date = new Date()): string {
  return toSchoolDateKey(now);
}

/** Midnight UTC of "today" in the school timezone. */
export function todayUtcMidnight(now: Date = new Date()): Date {
  return parseDateKey(todayKey(now));
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function diffInDays(from: Date, to: Date): number {
  const fromMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY);
}

export interface Countdown {
  /** Calendar days remaining: 1 == "H-1" (tomorrow). */
  days: number;
  /** `H-1`, `Hari ini`, `Terlambat 2 hari`. */
  label: string;
  hours: number;
  isPast: boolean;
}

export function countdownTo(target: Date, now: Date = new Date()): Countdown {
  const days = diffInDays(now, target);
  const hours = Math.round((target.getTime() - now.getTime()) / MS_PER_HOUR);
  let label: string;
  if (days === 0) label = 'Hari ini';
  else if (days === 1) label = 'H-1';
  else if (days > 1) label = `H-${days}`;
  else label = `Terlambat ${Math.abs(days)} hari`;
  return { days, label, hours, isPast: target.getTime() < now.getTime() };
}

/** True when the calendar day of `target` is strictly before today. */
export function isBeforeToday(target: Date, now: Date = new Date()): boolean {
  return diffInDays(now, target) < 0;
}

/**
 * The instant 24h (configurable) before a shift starts. Shifts are anchored to
 * the school day: MORNING 07:00, AFTERNOON 12:30 local time.
 */
export const SHIFT_START_HOUR: Record<'MORNING' | 'AFTERNOON', { hour: number; minute: number }> = {
  MORNING: { hour: 7, minute: 0 },
  AFTERNOON: { hour: 12, minute: 30 },
};

/** Converts a wall-clock time in the school timezone to a UTC instant. */
export function zonedTimeToUtc(dateKey: string, hour: number, minute: number): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  // Determine the zone offset at that local time by formatting a probe instant.
  const probe = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = timezoneOffsetMinutes(new Date(probe));
  return new Date(probe - offsetMinutes * 60_000);
}

function timezoneOffsetMinutes(instant: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Start instant (UTC) of a duty shift. */
export function dutyShiftStart(date: Date, shift: 'MORNING' | 'AFTERNOON'): Date {
  const { hour, minute } = SHIFT_START_HOUR[shift];
  return zonedTimeToUtc(toDateKey(date), hour, minute);
}
