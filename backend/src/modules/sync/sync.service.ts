import { prisma } from '../../db/prisma';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { mergeFields, type FieldClockMap } from '../../lib/hlc';
import { parseDateKey, toDateKey, todayUtcMidnight } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { writeAudit } from '../../lib/audit';
import type { AuthUser } from '../../types/express';
import type { SyncEntityType, SyncOperation } from '../../domain/enums';
import { isAuthoring } from '../../domain/enums';
import { permittedItemsForDate } from '../uniform/uniform.service';
import { isPastDue } from '../homework/homework.service';
import { SYNC_PAYLOAD_SCHEMAS, type PushSyncInput, type SyncChangeInput } from './sync.schemas';

export interface SyncApplied {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  version: number;
  appliedFields: string[];
}

export interface SyncConflict {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  reason: string;
  message: string;
  serverVersion: number | null;
}

export interface PushSyncResult {
  serverTime: string;
  applied: SyncApplied[];
  conflicts: SyncConflict[];
}

/** Flattens a typed payload into the field map the merge works on. */
function flattenPayload(entityType: SyncEntityType, payload: Record<string, unknown>): Record<string, unknown> {
  if (entityType === 'UNIFORM_CHECKLIST') {
    const items = (payload.items ?? {}) as Record<string, boolean>;
    return Object.fromEntries(Object.entries(items).map(([key, checked]) => [`item:${key}`, checked]));
  }
  return { ...payload };
}

/**
 * Applies merged fields to the real tables.
 *
 * Every applier re-checks the business rules on the *server* state, because an
 * offline client may have edited a record that changed while it was away.
 */
type Applier = (
  actor: AuthUser,
  entityId: string,
  operation: SyncOperation,
  fields: Record<string, unknown>,
  now: Date,
) => Promise<void>;

const appliers: Record<SyncEntityType, Applier> = {
  async DUTY(actor, entityId, operation, fields, now) {
    const duty = await prisma.dutySchedule.findFirst({ where: { id: entityId, deletedAt: null } });
    if (!duty) throw new NotFoundError('Jadwal piket tidak ditemukan');

    if (operation === 'DELETE') {
      if (!isAuthoring(actor.role) && actor.role !== 'CLASS_GUARDIAN') throw new ForbiddenError('Tidak dapat menghapus piket');
      if (actor.classId && actor.classId !== duty.classId) throw new ForbiddenError('Piket berada di kelas lain');
      await prisma.dutySchedule.update({ where: { id: entityId }, data: { deletedAt: now } });
      return;
    }

    const isAssigned = actor.id === duty.assignedStudentId;
    const isClassStaff = isAuthoring(actor.role) && (!actor.classId || actor.classId === duty.classId);
    if (!isAssigned && !isClassStaff) throw new ForbiddenError('Tidak dapat mengubah piket ini');

    const data: Record<string, unknown> = {};
    if ('completedAt' in fields) {
      const value = fields.completedAt as string | null;
      if (value === null) {
        if (!isClassStaff) throw new ForbiddenError('Hanya guru yang dapat membatalkan penyelesaian piket');
        data.completedAt = null;
        data.completedById = null;
      } else {
        // Same rule as the REST endpoint: cannot complete before the day arrives.
        if (parseDateKey(toDateKey(duty.date)).getTime() > todayUtcMidnight(now).getTime()) {
          throw new ConflictError('Piket belum dapat diselesaikan sebelum harinya tiba');
        }
        data.completedAt = new Date(value);
        data.completedById = actor.id;
      }
    }
    if ('notes' in fields) {
      if (!isClassStaff) throw new ForbiddenError('Hanya guru yang dapat mengubah catatan piket');
      data.notes = fields.notes;
    }
    if (Object.keys(data).length === 0) throw new ConflictError('Tidak ada perubahan yang dapat diterapkan');
    await prisma.dutySchedule.update({ where: { id: entityId }, data });
  },

  async UNIFORM_CHECKLIST(actor, entityId, operation, fields, now) {
    const checklist = await prisma.uniformChecklist.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { items: true },
    });
    if (!checklist) throw new NotFoundError('Checklist tidak ditemukan');
    if (checklist.studentId !== actor.id) throw new ForbiddenError('Checklist milik siswa lain');

    if (operation === 'DELETE') {
      await prisma.uniformChecklist.update({ where: { id: entityId }, data: { deletedAt: now } });
      return;
    }

    const dateKey = toDateKey(checklist.date);
    const permitted = await permittedItemsForDate(dateKey);
    if (permitted.dayType === 'HOLIDAY') throw new ConflictError('Tidak ada checklist seragam pada hari libur');

    const itemFields = Object.entries(fields).filter(([key]) => key.startsWith('item:'));
    if (itemFields.length === 0) throw new ConflictError('Tidak ada item checklist yang dapat diterapkan');

    const existing = new Map(checklist.items.map((item) => [item.itemKey, item]));
    const catalog = await prisma.uniformItem.findMany({ where: { key: { in: permitted.keys } } });
    const catalogByKey = new Map(catalog.map((item) => [item.key, item]));

    for (const [field, value] of itemFields) {
      const itemKey = field.slice('item:'.length);
      if (!permitted.keys.includes(itemKey)) {
        throw new ConflictError(`Item "${itemKey}" tidak diizinkan kalender akademik pada ${dateKey}`);
      }
      const checked = Boolean(value);
      const label = catalogByKey.get(itemKey)?.label ?? itemKey;
      const current = existing.get(itemKey);
      if (current) {
        await prisma.uniformChecklistItem.update({
          where: { id: current.id },
          data: { checked, checkedAt: checked ? now : null },
        });
      } else {
        await prisma.uniformChecklistItem.create({
          data: { checklistId: checklist.id, itemKey, label, checked, checkedAt: checked ? now : null },
        });
      }
    }
  },

  async HOMEWORK(actor, entityId, operation, fields, now) {
    const homework = await prisma.homework.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { submissions: true },
    });
    if (!homework) throw new NotFoundError('Tugas tidak ditemukan');

    const isCreator = homework.createdById === actor.id;
    const isClassStaff = isAuthoring(actor.role) && homework.classId !== null && homework.classId === actor.classId;
    if (!isCreator && !isClassStaff) throw new ForbiddenError('Tidak dapat mengubah tugas ini');

    if (operation === 'DELETE') {
      if (isPastDue(homework, now) || homework.submissions.some((s) => s.isLate)) {
        await writeAudit({
          actorId: actor.id,
          actorRole: actor.role,
          action: 'homework.delete.denied',
          entityType: 'Homework',
          entityId,
          metadata: { reason: 'LATE_HOMEWORK_IMMUTABLE', via: 'sync' },
        });
        throw new ForbiddenError('Tugas yang sudah terlambat tidak dapat dihapus');
      }
      await prisma.homework.update({ where: { id: entityId }, data: { deletedAt: now } });
      return;
    }

    if (homework.submissions.some((s) => s.status === 'GRADED')) {
      throw new ConflictError('Tugas yang sudah dinilai tidak dapat diubah');
    }

    const data: Record<string, unknown> = {};
    if ('title' in fields) data.title = fields.title;
    if ('description' in fields) data.description = fields.description;
    if ('dueDate' in fields) data.dueDate = new Date(fields.dueDate as string);
    if (Object.keys(data).length === 0) throw new ConflictError('Tidak ada perubahan yang dapat diterapkan');
    await prisma.homework.update({ where: { id: entityId }, data });
  },

  async EXAM(actor, entityId, operation, fields, now) {
    const exam = await prisma.examSchedule.findFirst({ where: { id: entityId, deletedAt: null } });
    if (!exam) throw new NotFoundError('Jadwal ujian tidak ditemukan');
    if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat mengubah jadwal ujian');
    if (actor.classId && actor.classId !== exam.classId) throw new ForbiddenError('Jadwal ujian berada di kelas lain');

    // Immutability rule applies just as hard to offline edits.
    if (exam.publishedAt) {
      await writeAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: operation === 'DELETE' ? 'exam.delete.denied' : 'exam.update.denied',
        entityType: 'ExamSchedule',
        entityId,
        metadata: { reason: 'PUBLISHED_EXAM_IMMUTABLE', via: 'sync' },
      });
      throw new ForbiddenError('Jadwal ujian yang sudah dipublikasikan tidak dapat diubah');
    }

    if (operation === 'DELETE') {
      await prisma.examSchedule.update({ where: { id: entityId }, data: { deletedAt: now } });
      return;
    }

    const data: Record<string, unknown> = {};
    if ('title' in fields) data.title = fields.title;
    if ('room' in fields) data.room = fields.room;
    if ('startTime' in fields) data.startTime = fields.startTime;
    if ('endTime' in fields) data.endTime = fields.endTime;
    if ('examDate' in fields) data.examDate = parseDateKey(fields.examDate as string);

    const startTime = (data.startTime as string | undefined) ?? exam.startTime;
    const endTime = (data.endTime as string | undefined) ?? exam.endTime;
    if (endTime <= startTime) throw new ConflictError('Jam selesai harus setelah jam mulai');

    if (Object.keys(data).length === 0) throw new ConflictError('Tidak ada perubahan yang dapat diterapkan');
    await prisma.examSchedule.update({ where: { id: entityId }, data });
  },

  async SUBJECT(actor, entityId, operation, fields, now) {
    const subject = await prisma.subject.findFirst({ where: { id: entityId, deletedAt: null } });
    if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');
    if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat mengubah mata pelajaran');
    if (actor.classId && subject.classId && actor.classId !== subject.classId) {
      throw new ForbiddenError('Mata pelajaran berada di kelas lain');
    }

    if (operation === 'DELETE') {
      await prisma.subject.update({ where: { id: entityId }, data: { deletedAt: now } });
      return;
    }

    const data: Record<string, unknown> = {};
    if ('name' in fields) data.name = fields.name;
    if ('description' in fields) data.description = fields.description;
    if ('resourceUrl' in fields) data.resourceUrl = fields.resourceUrl;
    if (Object.keys(data).length === 0) throw new ConflictError('Tidak ada perubahan yang dapat diterapkan');
    await prisma.subject.update({ where: { id: entityId }, data });
  },
};

function parseFieldClocks(raw: string): FieldClockMap {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as FieldClockMap;
  } catch {
    return {};
  }
}

/**
 * Offline change ingestion.
 *
 * Each change is a CRDT update: the field-level LWW register decides per field
 * whether the offline edit wins, so concurrent edits to different fields merge
 * instead of clobbering. Once merged, the *server* business rules are applied
 * (an offline client cannot bypass the immutability of a published exam or
 * delete a late homework).
 */
export async function pushChanges(
  actor: AuthUser,
  input: PushSyncInput,
  now: Date = new Date(),
): Promise<PushSyncResult> {
  const result: PushSyncResult = { serverTime: now.toISOString(), applied: [], conflicts: [] };

  for (const change of input.changes) {
    const outcome = await applyOne(actor, input.clientId, change, now);
    if (outcome.kind === 'applied') result.applied.push(outcome.value);
    else result.conflicts.push(outcome.value);
  }

  logger.info(
    { userId: actor.id, clientId: input.clientId, applied: result.applied.length, conflicts: result.conflicts.length },
    'sync push processed',
  );

  return result;
}

type Outcome =
  | { kind: 'applied'; value: SyncApplied }
  | { kind: 'conflict'; value: SyncConflict };

async function applyOne(
  actor: AuthUser,
  clientId: string,
  change: SyncChangeInput,
  now: Date,
): Promise<Outcome> {
  const { entityType, entityId, operation, hlc, lamport } = change;

  const schema = SYNC_PAYLOAD_SCHEMAS[entityType];
  const parsed = schema.safeParse(change.payload);
  if (!parsed.success) {
    return {
      kind: 'conflict',
      value: {
        entityType,
        entityId,
        operation,
        reason: 'INVALID_PAYLOAD',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        serverVersion: null,
      },
    };
  }

  const state = await prisma.entityState.findUnique({ where: { entityType_entityId: { entityType, entityId } } });
  const localClocks = state ? parseFieldClocks(state.fieldClocks) : {};

  const incoming = flattenPayload(entityType, parsed.data as Record<string, unknown>);
  if (operation === 'DELETE') incoming.__deleted = true;

  const { merged, clocks, appliedFields, rejectedFields } = mergeFields({}, localClocks, incoming, hlc);

  const conflict = (
    reason: string,
    message: string,
    serverVersion: number | null,
  ): Outcome => ({
    kind: 'conflict',
    value: { entityType, entityId, operation, reason, message, serverVersion },
  });

  if (appliedFields.length === 0 && rejectedFields.length > 0) {
    await recordChange(actor, clientId, change, state?.version ?? null, false, true);
    return conflict('STALE_WRITE', 'Perubahan kalah dari versi server yang lebih baru', state?.version ?? null);
  }

  const applyFields = { ...merged };
  delete applyFields.__deleted;

  try {
    await appliers[entityType](actor, entityId, operation, applyFields, now);
  } catch (error) {
    const isKnown = error instanceof AppError;
    await recordChange(actor, clientId, change, state?.version ?? null, false, true);
    return conflict(
      isKnown ? error.code : 'APPLY_FAILED',
      isKnown ? error.message : 'Perubahan tidak dapat diterapkan',
      state?.version ?? null,
    );
  }

  const nextVersion = (state?.version ?? 0) + 1;
  await prisma.entityState.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: {
      entityType,
      entityId,
      version: nextVersion,
      fieldClocks: JSON.stringify(clocks),
      deleted: operation === 'DELETE',
      ownerId: actor.id,
    },
    update: {
      version: nextVersion,
      fieldClocks: JSON.stringify(clocks),
      deleted: operation === 'DELETE',
      ownerId: actor.id,
    },
  });

  await recordChange(actor, clientId, change, nextVersion, true, false, lamport);

  return {
    kind: 'applied',
    value: { entityType, entityId, operation, version: nextVersion, appliedFields },
  };
}

function recordChange(
  actor: AuthUser,
  clientId: string,
  change: SyncChangeInput,
  serverVersion: number | null,
  applied: boolean,
  conflicted: boolean,
  lamport = change.lamport,
): Promise<unknown> {
  return prisma.syncChange.create({
    data: {
      userId: actor.id,
      clientId,
      entityType: change.entityType,
      entityId: change.entityId,
      operation: change.operation,
      hlc: change.hlc,
      lamport,
      payload: JSON.stringify(change.payload),
      serverVersion,
      applied,
      conflicted,
    },
  });
}

/**
 * Changes the server knows about since `since`, for entities this user has
 * synced. Clients use it to reconcile after a long offline period.
 */
export async function pullChanges(actor: AuthUser, since?: string, limit = 200) {
  const states = await prisma.entityState.findMany({
    where: {
      ownerId: actor.id,
      ...(since ? { updatedAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  return {
    serverTime: new Date().toISOString(),
    cursor: states.length > 0 ? states[states.length - 1]!.updatedAt.toISOString() : since ?? null,
    hasMore: states.length === limit,
    items: states.map((state) => ({
      entityType: state.entityType as SyncEntityType,
      entityId: state.entityId,
      version: state.version,
      deleted: state.deleted,
      fieldClocks: parseFieldClocks(state.fieldClocks),
      updatedAt: state.updatedAt.toISOString(),
    })),
  };
}

/** Backlog view that powers the "pending sync" indicator in the app. */
export async function syncStatus(actor: AuthUser) {
  const [pending, conflicts, lastChange] = await Promise.all([
    prisma.syncChange.count({ where: { userId: actor.id, applied: false, conflicted: false } }),
    prisma.syncChange.count({ where: { userId: actor.id, conflicted: true } }),
    prisma.syncChange.findFirst({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    pending,
    conflicts,
    lastSyncedAt: lastChange?.createdAt.toISOString() ?? null,
    state: conflicts > 0 ? 'CONFLICT' : pending > 0 ? 'PENDING' : 'SYNCED',
  };
}