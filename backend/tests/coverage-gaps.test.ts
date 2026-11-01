import request from 'supertest';
import { EventEmitter } from 'node:events';
import { makeApp } from './helpers/app';
import {
  addDays,
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
import { formatHlc } from '../src/lib/hlc';
import { toDateKey } from '../src/lib/dates';

const app = makeApp();
const hlc = () => formatHlc({ millis: Date.now(), counter: 0, nodeId: 'dev-x' });

describe('sync coverage: duty', () => {
  async function ctx() {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `sd${Date.now()}@a.test` });
    const student = await registerUser(app, { classId: schoolClass.id, email: `ss${Date.now()}@a.test` });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.user.id,
      createdById: teacher.id,
      date: todayUtcMidnight(),
    });
    return { schoolClass, teacher, staff, student, duty };
  }

  async function push(header: Record<string, string>, changes: unknown[]) {
    return request(app).post('/api/v1/sync/push').set(header).send({ clientId: 'dev-x', changes });
  }

  it('lets staff add notes offline', async () => {
    const { staff, duty } = await ctx();
    const response = await push(staff.header, [
      { entityType: 'DUTY', entityId: duty.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { notes: 'Bawa sapu' } },
    ]);
    expect(response.body.applied).toHaveLength(1);
    expect((await prisma.dutySchedule.findUniqueOrThrow({ where: { id: duty.id } })).notes).toBe('Bawa sapu');
  });

  it('rejects notes from the student', async () => {
    const { student, duty } = await ctx();
    const response = await push(student.header, [
      { entityType: 'DUTY', entityId: duty.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { notes: 'X' } },
    ]);
    expect(response.body.conflicts[0].reason).toBe('FORBIDDEN');
  });

  it('lets staff cancel a completion but not the student', async () => {
    const { staff, student, duty } = await ctx();
    await prisma.dutySchedule.update({ where: { id: duty.id }, data: { completedAt: new Date() } });

    const denied = await push(student.header, [
      { entityType: 'DUTY', entityId: duty.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { completedAt: null } },
    ]);
    expect(denied.body.conflicts[0].reason).toBe('FORBIDDEN');

    const allowed = await push(staff.header, [
      { entityType: 'DUTY', entityId: duty.id, operation: 'UPDATE', hlc: hlc(), lamport: 2, payload: { completedAt: null } },
    ]);
    expect(allowed.body.applied).toHaveLength(1);
    expect((await prisma.dutySchedule.findUniqueOrThrow({ where: { id: duty.id } })).completedAt).toBeNull();
  });

  it('refuses completing a future duty offline', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await registerUser(app, { classId: schoolClass.id, email: `sd-future${Date.now()}@a.test` });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.user.id,
      createdById: teacher.id,
      date: addDays(todayUtcMidnight(), 3),
    });

    const response = await push(student.header, [
      {
        entityType: 'DUTY',
        entityId: duty.id,
        operation: 'UPDATE',
        hlc: hlc(),
        lamport: 1,
        payload: { completedAt: new Date().toISOString() },
      },
    ]);
    expect(response.body.conflicts[0].reason).toBe('CONFLICT');
  });

  it('soft-deletes a duty offline only for staff', async () => {
    const { staff, student, duty } = await ctx();
    const denied = await push(student.header, [
      { entityType: 'DUTY', entityId: duty.id, operation: 'DELETE', hlc: hlc(), lamport: 1, payload: {} },
    ]);
    expect(denied.body.conflicts[0].reason).toBe('FORBIDDEN');

    const allowed = await push(staff.header, [
      { entityType: 'DUTY', entityId: duty.id, operation: 'DELETE', hlc: hlc(), lamport: 2, payload: {} },
    ]);
    expect(allowed.body.applied).toHaveLength(1);
    expect((await prisma.dutySchedule.findUniqueOrThrow({ where: { id: duty.id } })).deletedAt).not.toBeNull();
  });

  it('404s an unknown duty', async () => {
    const { staff } = await ctx();
    const response = await push(staff.header, [
      {
        entityType: 'DUTY',
        entityId: '10101010-1010-4010-8010-101010101010',
        operation: 'UPDATE',
        hlc: hlc(),
        lamport: 1,
        payload: { notes: 'x' },
      },
    ]);
    expect(response.body.conflicts[0].reason).toBe('NOT_FOUND');
  });
});

describe('sync coverage: uniform deletion and catalog checks', () => {
  it('soft-deletes a checklist', async () => {
    const auth = await registerUser(app, { email: `su-del${Date.now()}@a.test` });
    const checklist = await prisma.uniformChecklist.create({
      data: { studentId: auth.user.id, date: todayUtcMidnight() },
    });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'dev-x',
        changes: [
          { entityType: 'UNIFORM_CHECKLIST', entityId: checklist.id, operation: 'DELETE', hlc: hlc(), lamport: 1, payload: {} },
        ],
      });

    expect(response.body.applied).toHaveLength(1);
    expect((await prisma.uniformChecklist.findUniqueOrThrow({ where: { id: checklist.id } })).deletedAt).not.toBeNull();
  });

  it('rejects toggles on a holiday', async () => {
    const auth = await registerUser(app, { email: `su-holiday${Date.now()}@a.test` });
    await prisma.academicCalendar.create({ data: { date: todayUtcMidnight(), dayType: 'HOLIDAY', uniformItems: '' } });
    const checklist = await prisma.uniformChecklist.create({
      data: { studentId: auth.user.id, date: todayUtcMidnight() },
    });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'UNIFORM_CHECKLIST',
            entityId: checklist.id,
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { items: { dasi: true } },
          },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('CONFLICT');
  });

  it('404s an unknown checklist and rejects an empty payload', async () => {
    const auth = await registerUser(app, { email: `su-missing${Date.now()}@a.test` });
    const missing = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'UNIFORM_CHECKLIST',
            entityId: '20202020-2020-4020-8020-202020202020',
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { items: { dasi: true } },
          },
        ],
      });
    expect(missing.body.conflicts[0].reason).toBe('NOT_FOUND');
  });
});

describe('sync coverage: homework and subject branches', () => {
  async function hwCtx() {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `hh${Date.now()}@a.test` });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 4),
    });
    return { schoolClass, teacher, subject, staff, homework };
  }

  it('applies description and dueDate edits', async () => {
    const { staff, homework } = await hwCtx();
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'HOMEWORK',
            entityId: homework.id,
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { description: 'Bab 3', dueDate: addDays(new Date(), 6).toISOString() },
          },
        ],
      });
    expect(response.body.applied).toHaveLength(1);
    const stored = await prisma.homework.findUniqueOrThrow({ where: { id: homework.id } });
    expect(stored.description).toBe('Bab 3');
  });

  it('rejects a payload with no applicable fields', async () => {
    const { staff, homework } = await hwCtx();
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: {} },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('CONFLICT');
  });

  it('soft-deletes a homework that is not late', async () => {
    const { staff, homework } = await hwCtx();
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [{ entityType: 'HOMEWORK', entityId: homework.id, operation: 'DELETE', hlc: hlc(), lamport: 1, payload: {} }],
      });
    expect(response.body.applied).toHaveLength(1);
    expect((await prisma.homework.findUniqueOrThrow({ where: { id: homework.id } })).deletedAt).not.toBeNull();
  });

  it('refuses a homework edit by an unrelated student', async () => {
    const { homework } = await hwCtx();
    const outsider = await registerUser(app, { email: `hw-out${Date.now()}@a.test` });
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(outsider.header)
      .send({
        clientId: 'dev-x',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { title: 'X' } },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('FORBIDDEN');
  });

  it('refuses a homework edit once graded', async () => {
    const { staff, homework } = await hwCtx();
    const student = await createUser({ role: 'STUDENT' });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'GRADED', grade: 90, submittedAt: new Date() },
    });
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { title: 'X' } },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('CONFLICT');
  });

  it('404s an unknown homework', async () => {
    const { staff } = await hwCtx();
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'HOMEWORK',
            entityId: '30303030-3030-4030-8030-303030303030',
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { title: 'X' },
          },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('NOT_FOUND');
  });

  it('applies subject edits and deletion, refusing wrong class', async () => {
    const { staff, subject } = await hwCtx();
    const renamed = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'SUBJECT',
            entityId: subject.id,
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { description: 'Deskripsi baru' },
          },
        ],
      });
    expect(renamed.body.applied).toHaveLength(1);

    const removed = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [{ entityType: 'SUBJECT', entityId: subject.id, operation: 'DELETE', hlc: hlc(), lamport: 2, payload: {} }],
      });
    expect(removed.body.applied).toHaveLength(1);
  });

  it('refuses subject sync from a student and an unknown subject', async () => {
    const { subject } = await hwCtx();
    const student = await registerUser(app, { email: `sub-student-sync${Date.now()}@a.test` });
    const denied = await request(app)
      .post('/api/v1/sync/push')
      .set(student.header)
      .send({
        clientId: 'dev-x',
        changes: [
          { entityType: 'SUBJECT', entityId: subject.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { name: 'X' } },
        ],
      });
    expect(denied.body.conflicts[0].reason).toBe('FORBIDDEN');

    const missing = await request(app)
      .post('/api/v1/sync/push')
      .set(student.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'SUBJECT',
            entityId: '40404040-4040-4040-8040-404040404040',
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { name: 'X' },
          },
        ],
      });
    expect(missing.body.conflicts[0].reason).toBe('NOT_FOUND');
  });

  it('applies exam edits while draft and refuses once published', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `ex${Date.now()}@a.test` });
    const draft = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });

    const edited = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'EXAM',
            entityId: draft.id,
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { room: 'R-1', examDate: toDateKey(addDays(new Date(), 9)) },
          },
        ],
      });
    expect(edited.body.applied).toHaveLength(1);

    const badTime = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'EXAM',
            entityId: draft.id,
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 2,
            payload: { endTime: '06:00' },
          },
        ],
      });
    expect(badTime.body.conflicts[0].reason).toBe('CONFLICT');

    const removed = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'dev-x',
        changes: [{ entityType: 'EXAM', entityId: draft.id, operation: 'DELETE', hlc: hlc(), lamport: 3, payload: {} }],
      });
    expect(removed.body.applied).toHaveLength(1);
  });

  it('refuses exam sync from a student and for an unknown exam', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const student = await registerUser(app, { classId: schoolClass.id, email: `ex-student${Date.now()}@a.test` });

    const denied = await request(app)
      .post('/api/v1/sync/push')
      .set(student.header)
      .send({
        clientId: 'dev-x',
        changes: [
          { entityType: 'EXAM', entityId: exam.id, operation: 'UPDATE', hlc: hlc(), lamport: 1, payload: { room: 'X' } },
        ],
      });
    expect(denied.body.conflicts[0].reason).toBe('FORBIDDEN');

    const missing = await request(app)
      .post('/api/v1/sync/push')
      .set(student.header)
      .send({
        clientId: 'dev-x',
        changes: [
          {
            entityType: 'EXAM',
            entityId: '50505050-5050-4050-8050-505050505050',
            operation: 'UPDATE',
            hlc: hlc(),
            lamport: 1,
            payload: { room: 'X' },
          },
        ],
      });
    expect(missing.body.conflicts[0].reason).toBe('NOT_FOUND');
  });
});

describe('dashboard coverage', () => {
  it('shows the holiday uniform card and the parent greeting path', async () => {
    const schoolClass = await createClass();
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const parent = await registerUser(app, { role: 'PARENT', email: `dash-holiday${Date.now()}@a.test` });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });
    await prisma.academicCalendar.create({ data: { date: todayUtcMidnight(), dayType: 'HOLIDAY', uniformItems: '' } });

    const response = await request(app).get('/api/v1/dashboard').set(parent.header);
    const uniform = response.body.cards.find((c: { key: string }) => c.key === 'uniform');
    expect(uniform.summary).toContain('libur');
    expect(uniform.badge.label).toBe('Libur');
  });

  it('greets according to Jakarta wall-clock time', async () => {
    const { fixedClock } = require('./helpers/app');
    const { createApp } = require('../src/app');
    const auth = await registerUser(app, { email: `dash-greet${Date.now()}@a.test` });

    const morning = createApp({ enableRateLimit: false, clock: fixedClock('2026-05-10T23:30:00.000Z') });
    const evening = createApp({ enableRateLimit: false, clock: fixedClock('2026-05-10T13:00:00.000Z') });

    const r1 = await request(morning).get('/api/v1/dashboard').set(auth.header);
    const r2 = await request(evening).get('/api/v1/dashboard').set(auth.header);

    expect(r1.body.greeting).toBe('Selamat pagi'); // 06:30 Jakarta
    expect(r2.body.greeting).toBe('Selamat malam'); // 20:00 Jakarta
  });
});

describe('subject coverage', () => {
  it('returns parent-visible subjects', async () => {
    const schoolClass = await createClass();
    await createSubject({ classId: schoolClass.id, name: 'Ekonomi', code: 'EKO1' });
    await createSubject({ classId: null, name: 'Umum', code: 'UMU1' });
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const parent = await registerUser(app, { role: 'PARENT', email: `sub-parent${Date.now()}@a.test` });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const response = await request(app).get('/api/v1/subjects').set(parent.header);
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBe(2);
  });

  it('returns an empty list for a parent without wards', async () => {
    const parent = await registerUser(app, { role: 'PARENT', email: `sub-parent-none${Date.now()}@a.test` });
    const response = await request(app).get('/api/v1/subjects').set(parent.header);
    expect(response.body.items).toEqual([]);
  });

  it('rejects assigning an unknown teacher', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `sub-notacher${Date.now()}@a.test` });
    const response = await request(app)
      .post('/api/v1/subjects')
      .set(auth.header)
      .send({ code: 'NTH1', name: 'X', teacherId: '61616161-6161-4161-8161-616161616161' });
    expect(response.status).toBe(404);
  });

  it('404s updating or deleting an unknown subject', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: `sub-404${Date.now()}@a.test` });
    const patch = await request(app)
      .patch('/api/v1/subjects/62626262-6262-4262-8262-626262626262')
      .set(auth.header)
      .send({ name: 'X' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete('/api/v1/subjects/62626262-6262-4262-8262-626262626262').set(auth.header);
    expect(del.status).toBe(404);
  });

  it('rejects an unknown teacher on update', async () => {
    const schoolClass = await createClass();
    const subject = await createSubject({ classId: schoolClass.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `sub-upd-teacher${Date.now()}@a.test` });
    const response = await request(app)
      .patch(`/api/v1/subjects/${subject.id}`)
      .set(auth.header)
      .send({ teacherId: '63636363-6363-4363-8363-636363636363' });
    expect(response.status).toBe(404);
  });
});

describe('APNS over HTTP/2', () => {
  const fakeRequest = () => {
    const req = new EventEmitter() as EventEmitter & {
      setEncoding: jest.Mock;
      end: jest.Mock;
    };
    req.setEncoding = jest.fn();
    req.end = jest.fn();
    return req;
  };

  afterEach(() => jest.resetModules());

  it('reports success on 200 and failure otherwise', async () => {
    const scenarios = [
      { status: 200, body: '', ok: true },
      { status: 410, body: '{"reason":"Unregistered"}', ok: false },
    ];

    for (const scenario of scenarios) {
      jest.resetModules();
      jest.doMock('node:http2', () => ({
        connect: jest.fn(() => {
          const client = new EventEmitter() as EventEmitter & { request: jest.Mock; close: jest.Mock };
          client.close = jest.fn();
          client.request = jest.fn(() => {
            const req = fakeRequest();
            setImmediate(() => {
              req.emit('response', { ':status': scenario.status });
              if (scenario.body) req.emit('data', scenario.body);
              req.emit('end');
            });
            return req;
          });
          return client;
        }),
      }));

      const { ApnsProvider } = require('../src/modules/notifications/providers/apns');
      const provider = new ApnsProvider({
        keyId: 'K',
        teamId: 'T',
        privateKey: (await import('../tests/helpers/keys')).EC_PRIVATE_KEY,
        bundleId: 'com.asisten.app',
        useSandbox: true,
      });
      const result = await provider.send({ token: 'tok', title: 't', body: 'b', data: {} });
      expect(result.ok).toBe(scenario.ok);
      if (!scenario.ok) expect(result.error).toContain('APNS 410');
    }
  });

  it('surfaces a stream error as a failed result', async () => {
    jest.doMock('node:http2', () => ({
      connect: jest.fn(() => {
        const client = new EventEmitter() as EventEmitter & { request: jest.Mock; close: jest.Mock };
        client.close = jest.fn();
        client.request = jest.fn(() => {
          const req = fakeRequest();
          setImmediate(() => req.emit('error', new Error('stream reset')));
          return req;
        });
        return client;
      }),
    }));

    const { ApnsProvider } = require('../src/modules/notifications/providers/apns');
    const provider = new ApnsProvider({
      keyId: 'K',
      teamId: 'T',
      privateKey: (await import('../tests/helpers/keys')).EC_PRIVATE_KEY,
      bundleId: 'com.asisten.app',
      useSandbox: false,
    });
    const result = await provider.send({ token: 'tok', title: 't', body: 'b', data: {} });
    expect(result).toMatchObject({ ok: false, error: 'stream reset' });
  });
});

describe('homework status/accent branches', () => {
  async function staffCtx() {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `hb${Date.now()}@a.test` });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 5),
    });
    return { schoolClass, teacher, subject, staff, student, homework };
  }

  it('marks staff homework GRADED when every submission is graded', async () => {
    const { staff, student, homework } = await staffCtx();
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'GRADED', grade: 90, submittedAt: new Date() },
    });
    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(staff.header);
    expect(response.body.homework.status).toBe('GRADED');
    expect(response.body.homework.accentColor).toBe('#2E86C1');
  });

  it('marks staff homework SUBMITTED when all are submitted', async () => {
    const { staff, student, homework } = await staffCtx();
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'SUBMITTED', submittedAt: new Date() },
    });
    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(staff.header);
    expect(response.body.homework.status).toBe('SUBMITTED');
    expect(response.body.homework.permissions.canGrade).toBe(true);
  });

  it('flags staff homework late when a submission is late', async () => {
    const { staff, student, homework } = await staffCtx();
    await prisma.homeworkSubmission.create({
      data: {
        homeworkId: homework.id,
        studentId: student.id,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        isLate: true,
      },
    });
    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(staff.header);
    expect(response.body.homework.isLate).toBe(true);
    expect(response.body.homework.accentColor).toBe('#C0392B');
  });

  it('renders a student submission badge without a published timestamp', async () => {
    const { schoolClass, teacher, subject, homework } = await staffCtx();
    await prisma.homework.update({ where: { id: homework.id }, data: { publishedAt: null } });
    const auth = await registerUser(app, { classId: schoolClass.id, email: `hs${Date.now()}@a.test` });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: auth.user.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.body.homework.publishedAt).toBeNull();
    expect(response.body.homework.status).toBe('SUBMITTED');
    expect(response.body.homework.accentColor).toBe('#27AE60');
    expect(teacher.id).toBeTruthy();
    expect(subject.id).toBeTruthy();
  });

  it('rejects an unparseable due date', async () => {
    const { schoolClass, subject } = await staffCtx();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `hb-baddue${Date.now()}@a.test` });
    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, classId: schoolClass.id, title: 'X', dueDate: 'not-a-date' });
    expect(response.status).toBe(400);
  });

  it('lists graded and submitted rows for a student with correct colours', async () => {
    const { schoolClass, teacher, subject } = await staffCtx();
    const auth = await registerUser(app, { classId: schoolClass.id, email: `hl${Date.now()}@a.test` });
    const graded = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 4),
    });
    const submitted = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 4),
    });
    await prisma.homeworkSubmission.createMany({
      data: [
        { homeworkId: graded.id, studentId: auth.user.id, status: 'GRADED', grade: 80, submittedAt: new Date() },
        { homeworkId: submitted.id, studentId: auth.user.id, status: 'SUBMITTED', submittedAt: new Date() },
      ],
    });

    const response = await request(app).get('/api/v1/homework').set(auth.header);
    const gradedRow = response.body.items.find((i: { id: string }) => i.id === graded.id);
    const submittedRow = response.body.items.find((i: { id: string }) => i.id === submitted.id);
    expect(gradedRow.accentColor).toBe('#2E86C1');
    expect(submittedRow.accentColor).toBe('#27AE60');
  });

  it('returns a personal-task roster row for staff when the homework has no class', async () => {
    const subject = await createSubject({});
    const owner = await createUser({ role: 'STUDENT' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: owner.id,
      ownerStudentId: owner.id,
      dueDate: addDays(new Date(), 3),
    });
    const staff = await registerUser(app, { role: 'TEACHER', email: `hb-personal${Date.now()}@a.test` });

    const response = await request(app).get(`/api/v1/homework/${homework.id}/submissions`).set(staff.header);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].studentId).toBe(owner.id);
  });
});

describe('duty coverage branches', () => {
  it('lists duties for a parent and filters by completion', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    await createDuty({ classId: schoolClass.id, assignedStudentId: child.id, createdById: teacher.id, completedAt: new Date() });
    const parent = await registerUser(app, { role: 'PARENT', email: `du-parent${Date.now()}@a.test` });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const done = await request(app).get('/api/v1/duties?completed=true').set(parent.header);
    expect(done.body.items).toHaveLength(1);

    const pending = await request(app).get('/api/v1/duties?completed=false').set(parent.header);
    expect(pending.body.items).toHaveLength(0);
  });

  it('rejects a student filtering another student id', async () => {
    const auth = await registerUser(app, { email: `du-student-filter${Date.now()}@a.test` });
    const other = await createUser({ role: 'STUDENT' });
    const response = await request(app).get(`/api/v1/duties?studentId=${other.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('rejects a teacher reading another class list explicitly', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 11-R');
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `du-teacher${Date.now()}@a.test` });
    const response = await request(app).get(`/api/v1/duties?classId=${otherClass.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('rejects updating a duty to a past date or a foreign student', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 11-S');
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `du-upd${Date.now()}@a.test` });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const foreign = await createUser({ role: 'STUDENT', classId: otherClass.id });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.id,
      createdById: auth.user.id,
      date: addDays(todayUtcMidnight(), 2),
    });

    const past = await request(app)
      .patch(`/api/v1/duties/${duty.id}`)
      .set(auth.header)
      .send({ date: toDateKey(addDays(todayUtcMidnight(), -2)) });
    expect(past.status).toBe(400);

    const foreignStudent = await request(app)
      .patch(`/api/v1/duties/${duty.id}`)
      .set(auth.header)
      .send({ assignedStudentId: foreign.id });
    expect(foreignStudent.status).toBe(400);
  });

  it('404s delete and update for an unknown duty', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: `du-404${Date.now()}@a.test` });
    expect((await request(app).delete('/api/v1/duties/70707070-7070-4070-8070-707070707070').set(auth.header)).status).toBe(404);
    expect(
      (await request(app).patch('/api/v1/duties/70707070-7070-4070-8070-707070707070').set(auth.header).send({ notes: 'x' })).status,
    ).toBe(404);
  });

  it('rejects deleting a duty in another class', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 11-T');
    const teacher = await createUser({ role: 'TEACHER', classId: otherClass.id });
    const student = await createUser({ role: 'STUDENT', classId: otherClass.id });
    const duty = await createDuty({ classId: otherClass.id, assignedStudentId: student.id, createdById: teacher.id, date: addDays(todayUtcMidnight(), 2) });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: `du-del-cross${Date.now()}@a.test` });

    const response = await request(app).delete(`/api/v1/duties/${duty.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });
});
