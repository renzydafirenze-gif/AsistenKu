import { z } from 'zod';

const urlSchema = z
  .string()
  .trim()
  .url('URL tidak valid')
  .max(2048)
  .refine((value) => /^https:\/\//i.test(value), 'Resource link harus menggunakan HTTPS');

export const createSubjectSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,12}$/, 'Kode 2-12 karakter huruf besar/angka'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  classId: z.string().uuid().nullish(),
  teacherId: z.string().uuid().nullish(),
  resourceUrl: urlSchema.nullish(),
});

export const updateSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    teacherId: z.string().uuid().nullable().optional(),
    resourceUrl: urlSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan');

export const subjectIdParamsSchema = z.object({ id: z.string().uuid('ID mata pelajaran tidak valid') });

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
