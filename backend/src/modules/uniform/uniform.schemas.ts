import { z } from 'zod';
import { dateKeySchema } from '../duty/duty.schemas';

export const uniformDateQuerySchema = z.object({
  date: dateKeySchema.optional(),
  studentId: z.string().uuid().optional(),
});

export const toggleUniformSchema = z.object({
  date: dateKeySchema,
  itemKey: z.string().trim().min(1).max(60),
  checked: z.boolean(),
});

export const calendarRangeQuerySchema = z.object({
  from: dateKeySchema,
  to: dateKeySchema,
});

export const upsertCalendarSchema = z.object({
  date: dateKeySchema,
  dayType: z.enum(['SCHOOL_DAY', 'HOLIDAY', 'EXAM_DAY', 'EVENT']),
  uniformItems: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  note: z.string().trim().max(300).nullish(),
});

export const createUniformItemSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{2,60}$/, 'Key hanya boleh huruf kecil, angka, dan _'),
  label: z.string().trim().min(1).max(120),
  category: z.enum(['DAILY', 'CEREMONY', 'SPORTS', 'SPECIAL']).default('DAILY'),
  isDefault: z.boolean().default(false),
});

export type ToggleUniformInput = z.infer<typeof toggleUniformSchema>;
