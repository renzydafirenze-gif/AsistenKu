import { z } from 'zod';
import { dateKeySchema } from '../duty/duty.schemas';

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:MM (24 jam)');

export const createExamSchema = z
  .object({
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    examDate: dateKeySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    room: z.string().trim().max(60).nullish(),
    publish: z.boolean().default(false),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'Jam selesai harus setelah jam mulai',
    path: ['endTime'],
  });

export const updateExamSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    examDate: dateKeySchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    room: z.string().trim().max(60).nullable().optional(),
    subjectId: z.string().uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan');

export const publishExamSchema = z.object({ published: z.literal(true) });

export const listExamQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  publishedOnly: z.enum(['true', 'false']).optional(),
});

export const examIdParamsSchema = z.object({ id: z.string().uuid('ID ujian tidak valid') });
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type ListExamQuery = z.infer<typeof listExamQuerySchema>;
