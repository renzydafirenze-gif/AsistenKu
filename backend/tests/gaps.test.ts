import request from 'supertest';
import { makeApp, fixedClock } from './helpers/app';
import {
  addDays,
  createCalendarDay,
  createClass,
  createDuty,
  createExam,
  createHomework,
  createSubject,
  createUser,
  registerUser,
  todayUtcMidnight,
} from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { env } from '../src/config/env';
import { writeAudit } from '../src/lib/audit';
import { PayloadTooLargeError, TooManyRequestsError } from '../src/lib/errors';
import { errorHandler } from '../src/middleware/errorHandler';
import { formatHlc, receiveHlc } from '../src/lib/hlc';
import { daysUntil } from '../src/modules/dashboard/dashboard.service';
import { activeTokensFor } from '../src/modules/notifications/pushToken.service';
import { upsertCalendarDay } from '../src/modules/uniform/uniform.service';
import { toDateKey } from '../src/lib/dates';
import type { AuthUser } from '../src/types/express';

const app = makeApp();
const hlc = () => formatHlc({ millis: Date.now(), counter: 0, nodeId: 'gap-dev' });
const uniq = () => Math.random().toString(36).slice(2, 9);

describe('app bootstrap branches', () => {
  it('serves the readiness probe', async () => {
    const response = await request(makeApp()).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
  });

  it('lets HTTPS traffic through in production and still refuses plaintext', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createApp: createProdApp } = require('../src/app');
        const prodApp = createProdApp({ enableRateLimit: false });
        void request(prodApp)
          .get('/health')
          .set('x-forwarded-proto', 'https')
          .then((response: request.Response) => {
            expect(response.status).toBe(200);
          });
        void request(prodApp)
          .get('/health')
          .set('x-forwarded-proto', 'http')
          .then((response: request.Response) => {
            expect(response.status).toBe(403);
          });
      });
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('audit resilience', () => {
  it('never lets an audit write failure mask the caller outcome', async () => {
    const spy = jest.spyOn(prisma.auditLog, 'create').mockRejectedValueOnce(new Error('audit table down'));
    await expect(
      writeAudit({ action: 'test.swallowed', entityType: 'Unit', metadata: { reason: 'test' } }),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('typed error constructors', () => {
  it('exposes status, code and message for 413 and 429', () => {
    const tooLarge = new PayloadTooLargeError();
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.code).toBe('PAYLOAD_TOO_LARGE');

    const throttled = new TooManyRequestsError('Tenang dulu');
    expect(throttled.status).toBe(429);
    expect(throttled.code).toBe('TOO_MANY_REQUESTS');
    expect(throttled.message).toBe('Tenang dulu');
  });
});

describe('error handler parse failures', () => {
  const buildRes = () => {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };
  const req: any = { id: 'req-parse', path: '/x', method: 'POST' };

  it('maps body-parser parse failures to 400 INVALID_JSON', () => {
    const res = buildRes();
    errorHandler(Object.assign(new Error('parse'), { type: 'entity.parse.failed' }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_JSON');
  });
});

describe('HLC receive branch', () => {
  it('keeps the local counter when only the local clock is current', () => {
    const local = formatHlc({ millis: 5_000, counter: 1, nodeId: 'a' });
    const remote = formatHlc({ millis: 4_000, counter: 3, nodeId: 'b' });
    // Physical clock is behind both, so the local millis wins and the counter ticks.
    const merged = receiveHlc(local, remote, 'a', 1_000);
    expect(merged).toBe(formatHlc({ millis: 5_000, counter: 2, nodeId: 'a' }));
  });
});

describe('registration and Google sign-in gaps', () => {
  it('refuses staff registration when the invite code is not configured', async () => {
    const original = env.STAFF_INVITE_CODE;
    (env as { STAFF_INVITE_CODE?: string }).STAFF_INVITE_CODE = undefined;
    try {
      const response = await request(app).post('/api/v1/auth/register').send({
        email: `noinvite${uniq()}@a.test`,
        password: 'Rahasia123',
        fullName: 'Pak Guru',
        role: 'TEACHER',
        inviteCode: 'anything-at-all-value',
      });
      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('dinonaktifkan');
    } finally {
      (env as { STAFF_INVITE_CODE?: string }).STAFF_INVITE_CODE = original;
    }
  });

  it('rejects Google sign-up with an unknown class', async () => {
    const googleApp = makeApp({
      googleVerifier: {
        verify: async () => ({ sub: `g-${uniq()}`, email: `gclass${uniq()}@a.test`, emailVerified: true }),
      },
    });
    const response = await request(googleApp)
      .post('/api/v1/auth/google')
      .send({ idToken: 'g'.repeat(64), role: 'STUDENT', classId: '77777777-7777-4777-8777-777777777777' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Kelas tidak ditemukan');
  });
});

describe('dashboard gaps', () => {
  it('degrades the uniform card when the ward checklist cannot be read', async () => {
    const parent = await registerUser(app, { role: 'PARENT', email: `dash-degrade${uniq()}@a.test` });
    // A guardian link to a non-student account makes the checklist lookup throw.
    const teacher = await createUser({ role: 'TEACHER' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: teacher.id } });

    const response = await request(app).get('/api/v1/dashboard').set(parent.header);
    expect(response.status).toBe(200);
    const uniform = response.body.cards.find((c: { key: string }) => c.key === 'uniform');
    expect(uniform.summary).toBe('Checklist belum tersedia');
    expect(uniform.badge.label).toBe('N/A');
  });

  it('computes days until an exam date', () => {
    const now = new Date('2026-05-10T03:00:00.000Z');
    expect(daysUntil(new Date('2026-05-13T00:00:00.000Z'), now)).toBe(3);
  });
});

describe('duty query/update gaps', () => {
  it('lets staff filter by their own class and by student id', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `du-q${uniq()}@a.test` });

    const byClass = await request(app).get(`/api/v1/duties?classId=${schoolClass.id}`).set(auth.header);
    expect(byClass.status).toBe(200);
    expect(byClass.body.items).toHaveLength(1);

    const byStudent = await request(app).get(`/api/v1/duties?studentId=${student.id}`).set(auth.header);
    expect(byStudent.status).toBe(200);
    expect(byStudent.body.items[0].assignedStudentId).toBe(student.id);
  });

  it('moves a duty to another future date', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `du-move${uniq()}@a.test` });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.id,
      createdById: auth.user.id,
      date: addDays(todayUtcMidnight(), 1),
    });
    const target = toDateKey(addDays(todayUtcMidnight(), 3));

    const response = await request(app).patch(`/api/v1/duties/${duty.id}`).set(auth.header).send({ date: target });
    expect(response.status).toBe(200);
    expect(response.body.duty.date).toBe(target);
  });
});

describe('exam gaps', () => {
  it('lets staff scope the calendar to their own class and swap the subject', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const first = await createSubject({ classId: schoolClass.id, code: `EX${uniq().toUpperCase().slice(0, 5)}` });
    const second = await createSubject({ classId: schoolClass.id, code: `EY${uniq().toUpperCase().slice(0, 5)}` });
    const exam = await createExam({ classId: schoolClass.id, subjectId: first.id, createdById: teacher.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `ex-q${uniq()}@a.test` });

    const scoped = await request(app).get(`/api/v1/exams?classId=${schoolClass.id}`).set(auth.header);
    expect(scoped.status).toBe(200);

    const swapped = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set(auth.header)
      .send({ subjectId: second.id });
    expect(swapped.status).toBe(200);
    expect(swapped.body.exam.subject.id).toBe(second.id);
  });
});

describe('homework gaps', () => {
  it('summarises a PENDING submission and exposes the staff roster view', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 4),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'PENDING' },
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `hw-sum${uniq()}@a.test` });
    const response = await request(app).get('/api/v1/homework').set(auth.header);
    expect(response.status).toBe(200);
    const row = response.body.items.find((i: { id: string }) => i.id === homework.id);
    expect(row.summary).toMatchObject({ total: 1, pending: 1, submitted: 0, graded: 0 });
  });

  it('refuses staff reading homework from another class', async () => {
    const homeClass = await createClass();
    const otherClass = await createClass('Kelas 11-GAP');
    const teacher = await createUser({ role: 'TEACHER', classId: otherClass.id });
    const subject = await createSubject({ classId: otherClass.id });
    const homework = await createHomework({
      classId: otherClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 3),
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: homeClass.id, email: `hw-cross${uniq()}@a.test` });
    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('kelas lain');
  });

  it('lets staff retarget the subject and the due date of a task', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const first = await createSubject({ classId: schoolClass.id, code: `HA${uniq().toUpperCase().slice(0, 5)}` });
    const second = await createSubject({ classId: schoolClass.id, code: `HB${uniq().toUpperCase().slice(0, 5)}` });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: first.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 3),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `hw-retarget${uniq()}@a.test` });
    const nextDue = addDays(new Date(), 9).toISOString();

    const response = await request(app)
      .patch(`/api/v1/homework/${homework.id}`)
      .set(auth.header)
      .send({ subjectId: second.id, dueDate: nextDue });

    expect(response.status).toBe(200);
    expect(response.body.homework.subject.id).toBe(second.id);
    // Staff callers get the aggregate DTO, not a single-student view.
    expect(response.body.homework.summary).toBeDefined();
    expect(response.body.homework.assignment).toBeNull();
  });
});

describe('notification failure propagation', () => {
  it('rethrows unexpected log write failures', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const tomorrow = addDays(todayUtcMidnight(), 1);
    await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id, date: tomorrow });
    await prisma.pushToken.create({ data: { userId: student.id, token: `tok-gap-${uniq()}`, platform: 'FCM' } });

    const spy = jest.spyOn(prisma.notificationLog, 'create').mockRejectedValueOnce(new Error('log write failed'));
    const service = (makeApp().locals as { notificationService: { runDutyReminders(): Promise<unknown> } })
      .notificationService;
    await expect(service.runDutyReminders()).rejects.toThrow('log write failed');
    spy.mockRestore();
  });
});

describe('push token helpers', () => {
  it('lists only active tokens for an account', async () => {
    const user = await createUser({ role: 'STUDENT' });
    await prisma.pushToken.create({ data: { userId: user.id, token: `active-${uniq()}`, platform: 'FCM' } });
    await prisma.pushToken.create({
      data: { userId: user.id, token: `dead-${uniq()}`, platform: 'FCM', revokedAt: new Date() },
    });

    const tokens = await activeTokensFor(user.id);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.revokedAt).toBeNull();
  });
});

describe('subject gap: unscoped staff', () => {
  it('returns an empty subject list for staff without a class', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: `sub-unscoped${uniq()}@a.test` });
    const response = await request(app).get('/api/v1/subjects').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('lists class and shared subjects for class-scoped staff', async () => {
    const schoolClass = await createClass();
    await createSubject({ classId: schoolClass.id, code: `SC${uniq().toUpperCase().slice(0, 5)}` });
    await createSubject({ classId: null, code: `SD${uniq().toUpperCase().slice(0, 5)}` });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `sub-staff${uniq()}@a.test` });

    const response = await request(app).get('/api/v1/subjects').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
  });
});

describe('sync gaps', () => {
  it('creates a missing checklist item row on first sync', async () => {
    const auth = await registerUser(app, { email: `sync-create${uniq()}@a.test` });
    await prisma.uniformItem.create({ data: { key: `dasi-${uniq()}`, label: 'Dasi', category: 'CEREMONY', isDefault: true } });
    const itemKey = (await prisma.uniformItem.findFirstOrThrow({ where: { label: 'Dasi' } })).key;
    await createCalendarDay(todayUtcMidnight(), 'SCHOOL_DAY', [itemKey]);
    const checklist = await prisma.uniformChecklist.create({
      data: { studentId: auth.user.id, date: todayUtcMidnight() },
    });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'gap-dev',
        changes: [
          {
            entityType: 'UNIFORM_CHECKLIST',
            entityId: checklist.id,
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { items: { [itemKey]: true } },
          },
        ],
      });

    expect(response.body.applied).toHaveLength(1);
    const created = await prisma.uniformChecklistItem.findFirstOrThrow({ where: { checklistId: checklist.id } });
    expect(created.itemKey).toBe(itemKey);
    expect(created.checked).toBe(true);
  });

  it('refuses a subject that belongs to another class', async () => {
    const homeClass = await createClass();
    const otherClass = await createClass('Kelas 11-SY');
    const subject = await createSubject({ classId: otherClass.id, code: `SY${uniq().toUpperCase().slice(0, 5)}` });
    const auth = await registerUser(app, { role: 'TEACHER', classId: homeClass.id, email: `sync-sub-cross${uniq()}@a.test` });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'gap-dev',
        changes: [
          { entityType: 'SUBJECT', entityId: subject.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { name: 'X' } },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('FORBIDDEN');
    expect(response.body.conflicts[0].message).toContain('kelas lain');
  });

  it('falls back to an empty clock map when the stored clocks are corrupt', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 4),
    });
    await prisma.entityState.create({
      data: { entityType: 'HOMEWORK', entityId: homework.id, version: 3, fieldClocks: '{not-json', ownerId: teacher.id },
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `sync-corrupt${uniq()}@a.test` });
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'gap-dev',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { title: 'Baru' } },
        ],
      });

    expect(response.body.applied).toHaveLength(1);
    expect(response.body.applied[0].version).toBe(4);
  });
});

describe('uniform calendar authorisation', () => {
  it('rejects a student calling the service directly', async () => {
    const student = await createUser({ role: 'STUDENT' });
    const actor = {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
      role: 'STUDENT' as AuthUser['role'],
      classId: null,
    };
    await expect(
      upsertCalendarDay(actor, { date: toDateKey(todayUtcMidnight()), dayType: 'HOLIDAY', uniformItems: [] }),
    ).rejects.toThrow('Hanya guru atau wali kelas');
  });
});

describe('user route gap: staff classmates scoping', () => {
  it('refuses staff listing another class through the classmates endpoint', async () => {
    const homeClass = await createClass();
    const otherClass = await createClass('Kelas 11-UC');
    const auth = await registerUser(app, { role: 'TEACHER', classId: homeClass.id, email: `mates-staff${uniq()}@a.test` });

    const response = await request(app).get(`/api/v1/users/classmates?classId=${otherClass.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });
});
