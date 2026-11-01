import {
  daysBetween,
  formatClock,
  formatDateKey,
  formatIndonesianDate,
  formatIndonesianDay,
  greetingForHour,
  parseDateKey,
  relativeDayLabel,
  shiftLabel,
} from '../src/utils/format';

describe('format utils', () => {
  it('formats a local date key with padded parts', () => {
    expect(formatDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(formatDateKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('parses keys at local noon and rejects junk', () => {
    const parsed = parseDateKey('2026-10-31');
    expect(parsed.getDate()).toBe(31);
    expect(parsed.getHours()).toBe(12);
    expect(parsed.getMonth()).toBe(9);
    expect(() => parseDateKey('abc')).toThrow(/invalid date key/);
  });

  it('renders Indonesian dates', () => {
    expect(formatIndonesianDate('2026-10-31')).toBe('31 Okt 2026');
    expect(formatIndonesianDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatIndonesianDay('2026-10-31')).toBe('Sabtu, 31 Okt 2026');
  });

  it('labels shifts in Indonesian', () => {
    expect(shiftLabel('MORNING')).toBe('Pagi');
    expect(shiftLabel('AFTERNOON')).toBe('Siang');
    expect(shiftLabel(undefined)).toBe('Pagi');
  });

  it('computes whole-day differences', () => {
    expect(daysBetween('2026-10-31', '2026-10-31')).toBe(0);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-10-30')).toBe(-1);
  });

  it('labels relative days for the school UI', () => {
    expect(relativeDayLabel('2026-10-31', '2026-10-31')).toBe('Hari ini');
    expect(relativeDayLabel('2026-10-31', '2026-11-01')).toBe('Besok');
    expect(relativeDayLabel('2026-10-31', '2026-10-30')).toBe('Kemarin');
    expect(relativeDayLabel('2026-10-31', '2026-11-03')).toBe('H-3');
    expect(relativeDayLabel('2026-10-31', '2026-10-29')).toBe('Terlambat 2 hari');
  });

  it('formats clocks from HH:MM strings and ISO timestamps', () => {
    expect(formatClock('07:30')).toBe('07:30');
    expect(formatClock('not-a-date')).toBe('not-a-date');
    const iso = new Date(2026, 9, 31, 9, 5).toISOString();
    expect(formatClock(iso)).toBe('09:05');
  });

  it('derives the greeting from the hour', () => {
    expect(greetingForHour(7)).toBe('Selamat pagi');
    expect(greetingForHour(12)).toBe('Selamat siang');
    expect(greetingForHour(16)).toBe('Selamat sore');
    expect(greetingForHour(20)).toBe('Selamat malam');
  });
});
