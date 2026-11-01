import { daysBetween } from './format';

export interface DayGroup<T> {
  title: string;
  items: T[];
}

/**
 * Buckets dated rows into calendar-relative groups so a long list stays
 * readable: what is late, what is today, what is coming.
 */
export function groupByDay<T>(
  today: string,
  items: T[],
  dateOf: (item: T) => string,
): DayGroup<T>[] {
  const buckets: DayGroup<T>[] = [
    { title: 'Terlewat', items: [] },
    { title: 'Hari ini', items: [] },
    { title: 'Besok', items: [] },
    { title: 'Minggu ini', items: [] },
    { title: 'Berikutnya', items: [] },
  ];

  items.forEach((item) => {
    const days = daysBetween(today, dateOf(item));
    if (days < 0) buckets[0]!.items.push(item);
    else if (days === 0) buckets[1]!.items.push(item);
    else if (days === 1) buckets[2]!.items.push(item);
    else if (days <= 7) buckets[3]!.items.push(item);
    else buckets[4]!.items.push(item);
  });

  return buckets.filter((bucket) => bucket.items.length > 0);
}
