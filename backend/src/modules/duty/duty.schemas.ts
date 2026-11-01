import { z } from 'zod';
import { dutyShiftSchema } from '../../domain/enums';
import { parseDateKey } from '../../lib/dates';

export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((value) => {
    try {
      parseDateKey(value);
      return true;
    } catch {
      return false;
    }
  }, 'Tanggal tidak valid');

export const createDutySchema = z.object({
  classId: z.string().uuid(),
  date: dateKeySchema,
  shift: dutyShiftSchema,
  assignedStudentId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});

export const updateDutySchema = z
  .object({
    date: dateKeySchema.optional(),
    shift: dutyShiftSchema.optional(),
    assignedStudentId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan');

export const completeDutySchema = z.object({
  completedAt: z.string().datetime().optional(),
});

export const listDutyQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  studentId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  completed: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const dutyIdParamsSchema = z.object({ id: z.string().uuid('ID duty tidak valid') });

export type CreateDutyInput = z.infer<typeof createDutySchema>;
export type UpdateDutyInput = z.infer<typeof updateDutySchema>;
export type ListDutyQuery = z.infer<typeof listDutyQuerySchema>;
