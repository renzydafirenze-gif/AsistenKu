import { z } from 'zod';
import { syncEntityTypeSchema, syncOperationSchema } from '../../domain/enums';
import { dateKeySchema } from '../duty/duty.schemas';
import { isValidHlc } from '../../lib/hlc';

export const syncChangeSchema = z.object({
  entityType: syncEntityTypeSchema,
  entityId: z.string().uuid(),
  operation: syncOperationSchema,
  /** Client HLC; the server rejects malformed clocks rather than guessing. */
  hlc: z.string().refine(isValidHlc, 'HLC tidak valid'),
  lamport: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  // Partial document: every field is optional (field-level LWW).
  payload: z.record(z.unknown()).default({}),
});

export const pushSyncSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  changes: z.array(syncChangeSchema).min(1).max(500),
});

export const pullSyncSchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// ---- Per-entity payloads -------------------------------------------------

export const dutySyncPayload = z.object({
  completedAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const uniformSyncPayload = z.object({
  /** map of UniformItem.key -> checked. Omitted for DELETE operations. */
  items: z.record(z.boolean()).optional(),
  date: dateKeySchema.optional(),
});

export const homeworkSyncPayload = z
  .object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  dueDate: z.string().datetime().optional(),
});

export const examSyncPayload = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  room: z.string().trim().max(60).nullable().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  examDate: dateKeySchema.optional(),
});

export const subjectSyncPayload = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  resourceUrl: z.string().url().max(2048).nullable().optional(),
});

export const SYNC_PAYLOAD_SCHEMAS = {
  DUTY: dutySyncPayload,
  UNIFORM_CHECKLIST: uniformSyncPayload,
  HOMEWORK: homeworkSyncPayload,
  EXAM: examSyncPayload,
  SUBJECT: subjectSyncPayload,
} as const;

export type PushSyncInput = z.infer<typeof pushSyncSchema>;
export type SyncChangeInput = z.infer<typeof syncChangeSchema>;
