import { z } from 'zod';

/**
 * Single source of truth for the enum values that Prisma owns natively on
 * PostgreSQL but flattens to `String` on the SQLite test mirror. Zod enforces
 * the same set at the API boundary, so the invariant holds on both engines.
 */
export const ROLES = ['STUDENT', 'PARENT', 'TEACHER', 'CLASS_GUARDIAN'] as const;
export const DUTY_SHIFTS = ['MORNING', 'AFTERNOON'] as const;
export const DAY_TYPES = ['SCHOOL_DAY', 'HOLIDAY', 'EXAM_DAY', 'EVENT'] as const;
export const HOMEWORK_STATUSES = ['PENDING', 'SUBMITTED', 'GRADED'] as const;
export const NOTIFICATION_CHANNELS = ['FCM', 'APNS'] as const;
export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
export const SYNC_OPERATIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;
export const SYNC_ENTITY_TYPES = ['DUTY', 'UNIFORM_CHECKLIST', 'HOMEWORK', 'EXAM', 'SUBJECT'] as const;

export type Role = (typeof ROLES)[number];
export type DutyShift = (typeof DUTY_SHIFTS)[number];
export type DayType = (typeof DAY_TYPES)[number];
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const roleSchema = z.enum(ROLES);
export const dutyShiftSchema = z.enum(DUTY_SHIFTS);
export const dayTypeSchema = z.enum(DAY_TYPES);
export const homeworkStatusSchema = z.enum(HOMEWORK_STATUSES);
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export const syncOperationSchema = z.enum(SYNC_OPERATIONS);
export const syncEntityTypeSchema = z.enum(SYNC_ENTITY_TYPES);

/** Roles allowed to manage other people's records in a class. */
export const STAFF_ROLES: readonly Role[] = ['TEACHER', 'CLASS_GUARDIAN'];

/** Roles allowed to author homework / exams / subjects. */
export const AUTHORING_ROLES: readonly Role[] = ['TEACHER', 'CLASS_GUARDIAN'];

export function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role as Role);
}

export function isAuthoring(role: string): boolean {
  return AUTHORING_ROLES.includes(role as Role);
}
