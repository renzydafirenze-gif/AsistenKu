import { z } from 'zod';
import { dateKeySchema } from '../duty/duty.schemas';
import { homeworkStatusSchema } from '../../domain/enums';

const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(5000);

export const createHomeworkSchema = z.object({
  subjectId: z.string().uuid(),
  classId: z.string().uuid().nullish(),
  title,
  description: description.optional(),
  dueDate: z.string().datetime({ offset: true }).or(dateKeySchema),
});

export const updateHomeworkSchema = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    dueDate: z.string().datetime({ offset: true }).or(dateKeySchema).optional(),
    subjectId: z.string().uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan');

export const submitHomeworkSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const gradeHomeworkSchema = z.object({
  studentId: z.string().uuid(),
  grade: z.number().int().min(0).max(100),
  feedback: z.string().trim().max(2000).optional(),
});

export const listHomeworkQuerySchema = z.object({
  status: homeworkStatusSchema.optional(),
  subjectId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  lateOnly: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const homeworkIdParamsSchema = z.object({ id: z.string().uuid('ID tugas tidak valid') });

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
export type ListHomeworkQuery = z.infer<typeof listHomeworkQuerySchema>;