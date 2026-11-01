const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

/** `YYYY-MM-DD` in the device's local timezone, matching the API's date keys. */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` key at local noon to dodge DST/UTC off-by-one bugs. */
export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`invalid date key: ${key}`);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** `31 Okt 2026` */
export function formatIndonesianDate(key: string): string {
  const date = parseDateKey(key);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `Jumat, 31 Okt 2026` */
export function formatIndonesianDay(key: string): string {
  const date = parseDateKey(key);
  return `${DAYS[date.getDay()]}, ${formatIndonesianDate(key)}`;
}

export function shiftLabel(shift: string | undefined): string {
  return shift === 'AFTERNOON' ? 'Siang' : 'Pagi';
}

/** `YYYY-MM-DD` shifted by `days`, staying on calendar days (DST-safe). */
export function addDaysKey(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

/** Whole days from `today` to `key`; negative when in the past. */
export function daysBetween(today: string, key: string): number {
  const diff = parseDateKey(key).getTime() - parseDateKey(today).getTime();
  return Math.round(diff / 86_400_000);
}

/** Human label for an exam/homework date relative to today. */
export function relativeDayLabel(today: string, key: string): string {
  const days = daysBetween(today, key);
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  if (days === -1) return 'Kemarin';
  if (days > 1) return `H-${days}`;
  return `Terlambat ${Math.abs(days)} hari`;
}

/** `HH:MM` from an ISO timestamp or a `HH:MM` string, device timezone. */
export function formatClock(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

export function greetingForHour(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
