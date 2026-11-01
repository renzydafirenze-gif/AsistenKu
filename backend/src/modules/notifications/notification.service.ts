import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { isUniqueViolation } from '../../lib/prismaErrors';
import { dutyShiftStart, MS_PER_HOUR } from '../../lib/dates';
import type { NotificationChannel } from '../../domain/enums';
import { systemClock, type Clock, type PushProvider } from './types';
import { ApnsProvider } from './providers/apns';
import { FcmProvider } from './providers/fcm';
import { DryRunPushProvider } from './providers/dryRun';

export interface ReminderRunResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

export const DUTY_REMINDER_TYPE = 'DUTY_H1';

/**
 * Builds the push providers from configuration. Missing credentials fall back to
 * dry-run providers, which keeps the H-1 pipeline observable in every
 * environment without ever sending a real notification by accident.
 */
export function buildPushProviders(): Map<NotificationChannel, PushProvider> {
  const providers = new Map<NotificationChannel, PushProvider>();

  const dryRun = env.PUSH_DRY_RUN || env.NODE_ENV !== 'production';
  const hasFcm = Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
  const hasApns = Boolean(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY && env.APNS_BUNDLE_ID);

  providers.set(
    'FCM',
    !dryRun && hasFcm
      ? new FcmProvider({
          projectId: env.FCM_PROJECT_ID!,
          clientEmail: env.FCM_CLIENT_EMAIL!,
          privateKey: env.FCM_PRIVATE_KEY!,
        })
      : new DryRunPushProvider('FCM'),
  );

  providers.set(
    'APNS',
    !dryRun && hasApns
      ? new ApnsProvider({
          keyId: env.APNS_KEY_ID!,
          teamId: env.APNS_TEAM_ID!,
          privateKey: env.APNS_PRIVATE_KEY!,
          bundleId: env.APNS_BUNDLE_ID!,
          useSandbox: env.APNS_USE_SANDBOX,
        })
      : new DryRunPushProvider('APNS'),
  );

  return providers;
}

/**
 * Duty notification pipeline.
 *
 * Invariants enforced here (Phase 4 business rules):
 *  - only the *assigned student* is notified (never classmates, guardians or staff);
 *  - the reminder fires inside the H-1 window of that duty's shift;
 *  - `NotificationLog.dedupeKey` is unique, so an hourly scheduler, a retry or a
 *    concurrent worker can never deliver the same reminder twice (spam control).
 */
export class NotificationService {
  constructor(
    private readonly providers: Map<NotificationChannel, PushProvider>,
    private readonly clock: Clock = systemClock,
    private readonly leadHours: number = env.NOTIFICATION_LEAD_HOURS,
  ) {}

  async runDutyReminders(now: Date = this.clock.now()): Promise<ReminderRunResult> {
    const result: ReminderRunResult = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

    const candidates = await prisma.dutySchedule.findMany({
      where: {
        deletedAt: null,
        completedAt: null,
        // Today and tomorrow cover the whole 24h lead window for either shift.
        date: {
          gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
          lte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)),
        },
      },
      include: {
        assignedStudent: { select: { id: true, fullName: true, isActive: true } },
        class: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });

    for (const duty of candidates) {
      result.scanned += 1;

      const shiftStart = dutyShiftStart(duty.date, duty.shift as 'MORNING' | 'AFTERNOON');
      const notifyAt = new Date(shiftStart.getTime() - this.leadHours * MS_PER_HOUR);
      if (now.getTime() < notifyAt.getTime() || now.getTime() >= shiftStart.getTime()) continue;
      if (!duty.assignedStudent?.isActive) continue;

      const outcome = await this.notifyDutyH1({
        dutyId: duty.id,
        studentId: duty.assignedStudentId,
        studentName: duty.assignedStudent.fullName,
        className: duty.class.name,
        shift: duty.shift as 'MORNING' | 'AFTERNOON',
        dutyDate: duty.date,
      });
      result[outcome] += 1;
    }

    logger.info({ ...result }, 'duty reminder run finished');
    return result;
  }

  /** Sends exactly one H-1 reminder per (duty, student). */
  async notifyDutyH1(input: {
    dutyId: string;
    studentId: string;
    studentName: string;
    className: string;
    shift: 'MORNING' | 'AFTERNOON';
    dutyDate: Date;
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const dedupeKey = `${DUTY_REMINDER_TYPE}:${input.dutyId}:${input.studentId}`;

    let logId: string;
    try {
      const log = await prisma.notificationLog.create({
        data: {
          userId: input.studentId,
          dutyId: input.dutyId,
          type: DUTY_REMINDER_TYPE,
          dedupeKey,
          channel: 'FCM',
          status: 'PENDING',
        },
      });
      logId = log.id;
    } catch (error) {
      // Duck-typed: the SQLite test client is a separate generated class, so
      // `instanceof` would not match it.
      if (isUniqueViolation(error)) {
        logger.debug({ dedupeKey }, 'duty reminder already sent, skipping');
        return 'skipped';
      }
      throw error;
    }

    // Token dedupe: one physical device token maps to exactly one account, but a
    // user may re-register the same token; `Set` guarantees a single delivery.
    const tokens = await prisma.pushToken.findMany({
      where: { userId: input.studentId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    const uniqueTokens = [...new Map(tokens.map((t) => [t.token, t])).values()];

    if (uniqueTokens.length === 0) {
      await prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'SKIPPED', lastError: 'Tidak ada perangkat terdaftar' },
      });
      return 'skipped';
    }

    const shiftLabel = input.shift === 'MORNING' ? 'Pagi' : 'Siang';
    const dateLabel = input.dutyDate.toISOString().slice(0, 10);
    const title = `Piket H-1: ${dateLabel}`;
    const body = `Kamu bertugas piket ${shiftLabel} besok untuk kelas ${input.className}. Jangan lupa hadir ya, ${input.studentName.split(' ')[0]}!`;

    let anySuccess = false;
    let lastError: string | undefined;

    for (const token of uniqueTokens) {
      const provider = this.providers.get(token.platform as NotificationChannel);
      if (!provider) continue;

      const response = await provider.send({
        token: token.token,
        title,
        body,
        data: { type: DUTY_REMINDER_TYPE, dutyId: input.dutyId, shift: input.shift, date: dateLabel },
      });

      if (response.ok) {
        anySuccess = true;
      } else {
        lastError = response.error;
        if (response.tokenInvalid) {
          // Permanently invalid tokens are revoked so later runs stay clean.
          await prisma.pushToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
        }
      }
    }

    await prisma.notificationLog.update({
      where: { id: logId },
      data: {
        status: anySuccess ? 'SENT' : 'FAILED',
        sentAt: anySuccess ? this.clock.now() : null,
        attempts: uniqueTokens.length,
        lastError: anySuccess ? null : lastError ?? 'Gagal mengirim notifikasi',
        channel: (uniqueTokens[0]!.platform as NotificationChannel) ?? 'FCM',
      },
    });

    return anySuccess ? 'sent' : 'failed';
  }

  async listForUser(userId: string, limit = 50) {
    return prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        type: true,
        status: true,
        channel: true,
        sentAt: true,
        createdAt: true,
        dutyId: true,
      },
    });
  }
}
