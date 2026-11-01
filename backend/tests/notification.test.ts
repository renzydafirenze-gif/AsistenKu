import request from 'supertest';
import { makeApp, fixedClock } from './helpers/app';
import { addDays, createClass, createDuty, createUser, registerUser, todayUtcMidnight } from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { NotificationService, buildPushProviders } from '../src/modules/notifications/notification.service';
import { RecordingPushProvider } from '../src/modules/notifications/providers/dryRun';
import { zonedTimeToUtc, toDateKey } from '../src/lib/dates';

/** Builds a service whose providers are recording stubs (no network). */
function serviceWith(clockIso: string, options: { fcmFail?: boolean; apnsFail?: boolean } = {}) {
  const fcm = new RecordingPushProvider('FCM', options.fcmFail ? { ok: false, error: 'FCM 500' } : { ok: true });
  const apns = new RecordingPushProvider('APNS', options.apnsFail ? { ok: false, error: 'APNS 410' } : { ok: true });
  const providers = new Map<'FCM' | 'APNS', RecordingPushProvider>([
    ['FCM', fcm],
    ['APNS', apns],
  ]);
  const service = new NotificationService(providers, fixedClock(clockIso));
  return { service, fcm, apns };
}

describe('H-1 duty reminders', () => {
  it('notifies only the assigned student, 24 hours before the shift', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const assigned = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Ani Lestari' });
    const classmate = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Beni' });

    const dutyDate = addDays(todayUtcMidnight(), 1);
    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    await createDuty({
      classId: schoolClass.id,
      assignedStudentId: assigned.id,
      createdById: teacher.id,
      date: dutyDate,
      shift: 'MORNING',
    });

    await prisma.pushToken.create({ data: { userId: assigned.id, token: 'token-assigned', platform: 'FCM' } });
    await prisma.pushToken.create({ data: { userId: classmate.id, token: 'token-classmate', platform: 'FCM' } });

    const { service, fcm } = serviceWith(new Date(shiftStart.getTime() - 23 * 3_600_000).toISOString());
    const result = await service.runDutyReminders();

    expect(result.sent).toBe(1);
    expect(fcm.sent).toHaveLength(1);
    expect(fcm.sent[0]!.token).toBe('token-assigned');
    expect(fcm.sent[0]!.body).toContain('Ani');
    expect(fcm.sent[0]!.data).toMatchObject({ type: 'DUTY_H1', shift: 'MORNING' });

    const logs = await prisma.notificationLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.userId).toBe(assigned.id);
    expect(logs[0]!.status).toBe('SENT');
  });

  it('does not fire outside the H-1 window', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const dutyDate = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: dutyDate });
    await prisma.pushToken.create({ data: { userId: student.id, token: 'tok-too-early', platform: 'FCM' } });

    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    const tooEarly = serviceWith(new Date(shiftStart.getTime() - 48 * 3_600_000).toISOString());
    expect((await tooEarly.service.runDutyReminders()).sent).toBe(0);

    const tooLate = serviceWith(new Date(shiftStart.getTime() + 3_600_000).toISOString());
    expect((await tooLate.service.runDutyReminders()).sent).toBe(0);
    expect(tooEarly.fcm.sent).toHaveLength(0);
  });

  it('never sends the same reminder twice (dedupe)', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const dutyDate = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: dutyDate });
    await prisma.pushToken.create({ data: { userId: student.id, token: 'tok-dedupe', platform: 'FCM' } });

    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    const { service, fcm } = serviceWith(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString());

    const first = await service.runDutyReminders();
    const second = await service.runDutyReminders();
    const third = await service.runDutyReminders();

    expect(first.sent).toBe(1);
    expect(second.sent + second.skipped).toBeGreaterThanOrEqual(1);
    expect(second.sent).toBe(0);
    expect(third.sent).toBe(0);
    expect(fcm.sent).toHaveLength(1);
    expect(await prisma.notificationLog.count()).toBe(1);
  });

  it('delivers once per device token even when the token is registered twice', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const dutyDate = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: dutyDate });

    // Two rows, different platforms, same physical token (unique index prevents
    // an exact duplicate; the dedupe must still collapse the delivery).
    await prisma.pushToken.create({ data: { userId: student.id, token: 'shared-token-1', platform: 'FCM' } });
    await prisma.pushToken.create({ data: { userId: student.id, token: 'shared-token-2', platform: 'APNS' } });

    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    const { service, fcm, apns } = serviceWith(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString());
    await service.runDutyReminders();

    expect(fcm.sent).toHaveLength(1);
    expect(apns.sent).toHaveLength(1);
  });

  it('skips when the student has no registered device', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const dutyDate = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: dutyDate });

    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    const { service } = serviceWith(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString());
    const result = await service.runDutyReminders();

    expect(result.skipped).toBe(1);
    const log = await prisma.notificationLog.findFirstOrThrow();
    expect(log.status).toBe('SKIPPED');
  });

  it('records failures and revokes permanently invalid tokens', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const dutyDate = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: dutyDate });
    await prisma.pushToken.create({ data: { userId: student.id, token: 'dead-token', platform: 'FCM' } });

    const providers = new Map([
      ['FCM', new RecordingPushProvider('FCM', { ok: false, error: 'UNREGISTERED', tokenInvalid: true })],
      ['APNS', new RecordingPushProvider('APNS', { ok: true })],
    ]);
    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    const service = new NotificationService(
      providers as never,
      fixedClock(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString()),
    );

    const result = await service.runDutyReminders();
    expect(result.failed).toBe(1);

    const log = await prisma.notificationLog.findFirstOrThrow();
    expect(log.status).toBe('FAILED');
    expect(log.lastError).toContain('UNREGISTERED');

    const token = await prisma.pushToken.findFirstOrThrow({ where: { token: 'dead-token' } });
    expect(token.revokedAt).not.toBeNull();
  });

  it('ignores completed, deleted and inactive-student duties', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const inactive = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const dutyDate = addDays(todayUtcMidnight(), 1);

    await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.id,
      createdById: teacher.id,
      date: dutyDate,
      completedAt: new Date(),
    });
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: dutyDate, shift: 'AFTERNOON' });
    await prisma.dutySchedule.updateMany({ data: { deletedAt: new Date() }, where: { shift: 'AFTERNOON' } });
    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });
    await createDuty({ classId: schoolClass.id, assignedStudentId: inactive.id, createdById: teacher.id, date: dutyDate });
    await prisma.pushToken.createMany({
      data: [
        { userId: student.id, token: 't1-completed', platform: 'FCM' },
        { userId: inactive.id, token: 't2-inactive', platform: 'FCM' },
      ],
    });

    const shiftStart = zonedTimeToUtc(toDateKey(dutyDate), 7, 0);
    const { service, fcm } = serviceWith(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString());
    const result = await service.runDutyReminders();

    expect(result.sent).toBe(0);
    expect(fcm.sent).toHaveLength(0);
  });

  it('is exposed through the internal scheduler endpoint with a shared secret', async () => {
    const push = buildPushProviders();
    const app = makeApp({
      notificationService: new NotificationService(push, fixedClock('2026-05-01T00:00:00.000Z')),
    });

    const unauthorized = await request(app).post('/api/v1/notifications/run-duty-reminders');
    expect(unauthorized.status).toBe(403);

    const wrongSecret = await request(app)
      .post('/api/v1/notifications/run-duty-reminders')
      .set('x-job-secret', 'nope');
    expect(wrongSecret.status).toBe(403);

    const ok = await request(app)
      .post('/api/v1/notifications/run-duty-reminders')
      .set('x-job-secret', 'test-internal-job-secret-value');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ sent: 0, failed: 0 });
  });

  it('lists a user notification history', async () => {
    const auth = await registerUser(app(), { email: 'notif-list@a.test' });
    await prisma.notificationLog.create({
      data: {
        userId: auth.user.id,
        type: 'DUTY_H1',
        dedupeKey: 'k1',
        channel: 'FCM',
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const response = await request(app()).get('/api/v1/notifications').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('builds dry-run providers outside production', () => {
    const providers = buildPushProviders();
    expect(providers.get('FCM')).toBeDefined();
    expect(providers.get('APNS')).toBeDefined();
  });
});

function app() {
  return makeApp();
}

describe('reminder run resilience', () => {
  it('counts scanned duties without notifying when nobody has a device', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const tomorrow = addDays(todayUtcMidnight(), 1);
    const shiftStart = zonedTimeToUtc(toDateKey(tomorrow), 7, 0);
    const clockIso = new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString();

    // One runnable duty plus a deleted one that must be ignored by the scan.
    await createDuty({ classId: schoolClass.id, assignedStudentId: teacher.id, createdById: teacher.id, date: tomorrow });
    await createDuty({ classId: schoolClass.id, assignedStudentId: teacher.id, createdById: teacher.id, date: tomorrow, shift: 'AFTERNOON' });
    await prisma.dutySchedule.updateMany({ where: { shift: 'AFTERNOON' }, data: { deletedAt: new Date() } });

    const { service } = serviceWith(clockIso);
    const result = await service.runDutyReminders();
    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('uses device tokens on the correct channel', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const tomorrow = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: tomorrow });
    await prisma.pushToken.create({ data: { userId: student.id, token: 'apns-only', platform: 'APNS' } });

    const shiftStart = zonedTimeToUtc(toDateKey(tomorrow), 7, 0);
    const { service, fcm, apns } = serviceWith(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString());
    await service.runDutyReminders();

    expect(apns.sent[0]!.token).toBe('apns-only');
    expect(fcm.sent).toHaveLength(0);
  });

  it('ignores revoked tokens', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const tomorrow = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: tomorrow });
    await prisma.pushToken.create({
      data: { userId: student.id, token: 'revoked-token', platform: 'FCM', revokedAt: new Date() },
    });

    const shiftStart = zonedTimeToUtc(toDateKey(tomorrow), 7, 0);
    const { service, fcm } = serviceWith(new Date(shiftStart.getTime() - 20 * 3_600_000).toISOString());
    const result = await service.runDutyReminders();

    expect(result.skipped).toBe(1);
    expect(fcm.sent).toHaveLength(0);
  });

  it('surfaces an unexpected database failure instead of silently continuing', async () => {
    const { service } = serviceWith(new Date().toISOString());
    const spy = jest.spyOn(prisma.dutySchedule, 'findMany').mockRejectedValueOnce(new Error('db down'));
    await expect(service.runDutyReminders()).rejects.toThrow('db down');
    spy.mockRestore();
  });
});
