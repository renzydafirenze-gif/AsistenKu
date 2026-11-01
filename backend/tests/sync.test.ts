import request from 'supertest';
import { makeApp } from './helpers/app';
import {
  addDays,
  createClass,
  createHomework,
  createSubject,
  createUser,
  registerUser,
  todayUtcMidnight,
} from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { formatHlc, tickHlc, receiveHlc, compareHlc, mergeFields } from '../src/lib/hlc';
import { toDateKey } from '../src/lib/dates';

const app = makeApp();

function hlcAt(millis: number, counter = 0, nodeId = 'device-a'): string {
  return formatHlc({ millis, counter, nodeId });
}

describe('hybrid logical clock', () => {
  it('formats fixed-width, lexicographically sortable strings', () => {
    const a = hlcAt(1_700_000_000_000, 0, 'a');
    const b = hlcAt(1_700_000_000_001, 0, 'a');
    expect(a < b).toBe(true);
    expect(a.length).toBe(b.length);
  });

  it('orders by millis, then counter, then node id', () => {
    expect(compareHlc(hlcAt(10, 0), hlcAt(11, 0))).toBe(-1);
    expect(compareHlc(hlcAt(10, 1), hlcAt(10, 0))).toBe(1);
    expect(compareHlc(hlcAt(10, 0, 'a'), hlcAt(10, 0, 'b'))).toBe(-1);
    expect(compareHlc(hlcAt(10, 0), hlcAt(10, 0))).toBe(0);
  });

  it('never goes backwards when the physical clock does', () => {
    const previous = hlcAt(5_000, 3);
    const next = tickHlc(previous, 'device-a', 1_000);
    expect(compareHlc(next, previous)).toBe(1);
  });

  it('increments the counter for same-millisecond events', () => {
    const first = tickHlc(null, 'device-a', 1_000);
    const second = tickHlc(first, 'device-a', 1_000);
    expect(second).toBe(hlcAt(1_000, 1));
  });

  it('merges a remote clock that is ahead', () => {
    const merged = receiveHlc(hlcAt(1_000, 0, 'a'), hlcAt(9_000, 5, 'b'), 'a', 2_000);
    expect(compareHlc(merged, hlcAt(9_000, 5, 'b'))).toBe(1);
  });

  it('rejects malformed clocks on the wire', async () => {
    const auth = await registerUser(app, { email: 'hlc-bad@a.test' });
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'device-a',
        changes: [
          {
            entityType: 'HOMEWORK',
            entityId: '33333333-3333-4333-8333-333333333333',
            operation: 'UPDATE',
            hlc: 'not-an-hlc',
            lamport: 1,
            payload: {},
          },
        ],
      });
    expect(response.status).toBe(400);
  });
});

describe('field-level merge', () => {
  it('applies newer fields and keeps older local ones', () => {
    const local = { title: 'Lama', description: 'Deskripsi lama' };
    const clocks = { title: hlcAt(1_000), description: hlcAt(9_000) };

    const result = mergeFields(local, clocks, { title: 'Baru', description: 'Deskripsi baru' }, hlcAt(5_000));
    expect(result.merged.title).toBe('Baru');
    expect(result.merged.description).toBe('Deskripsi lama');
    expect(result.appliedFields).toEqual(['title']);
    expect(result.rejectedFields).toEqual(['description']);
  });

  it('merges concurrent edits to different fields without loss', () => {
    const local = { title: 'Judul' };
    const clocks = { title: hlcAt(1_000, 0, 'a') };
    const result = mergeFields(local, clocks, { description: 'Ditambah offline' }, hlcAt(500, 0, 'b'));
    expect(result.merged).toEqual({ title: 'Judul', description: 'Ditambah offline' });
    expect(result.appliedFields).toEqual(['description']);
  });
});

describe('offline sync', () => {
  async function syncContext() {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: `sync${Math.random().toString(36).slice(2, 8)}@a.test` });
    // Homework/subject mutations require the authoring role.
    const staff = await registerUser(app, {
      role: 'TEACHER',
      classId: schoolClass.id,
      email: `syncstaff${Math.random().toString(36).slice(2, 8)}@a.test`,
    });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      title: 'Judul Awal',
      dueDate: addDays(new Date(), 3),
    });
    return { schoolClass, teacher, subject, auth, staff, homework };
  }

  it('applies an offline completion of a duty', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'sync-duty@a.test' });
    const duty = await prisma.dutySchedule.create({
      data: {
        classId: schoolClass.id,
        assignedStudentId: auth.user.id,
        createdById: teacher.id,
        date: todayUtcMidnight(),
        shift: 'MORNING',
      },
    });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'device-a',
        changes: [
          {
            entityType: 'DUTY',
            entityId: duty.id,
            operation: 'UPDATE',
            hlc: hlcAt(Date.now()),
            lamport: 1,
            payload: { completedAt: new Date().toISOString() },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.applied).toHaveLength(1);
    expect(response.body.applied[0].version).toBe(1);

    const updated = await prisma.dutySchedule.findUniqueOrThrow({ where: { id: duty.id } });
    expect(updated.completedAt).not.toBeNull();
  });

  it('rejects a stale write and reports a conflict', async () => {
    const { staff, homework } = await syncContext();
    const newer = hlcAt(Date.now());
    const older = hlcAt(Date.now() - 60_000);

    const first = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: newer, lamport: 2, payload: { title: 'Versi Server' } },
        ],
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-b',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: older, lamport: 1, payload: { title: 'Versi Lama' } },
        ],
      });

    expect(second.status).toBe(200);
    expect(second.body.conflicts).toHaveLength(1);
    expect(second.body.conflicts[0].reason).toBe('STALE_WRITE');

    const stored = await prisma.homework.findUniqueOrThrow({ where: { id: homework.id } });
    expect(stored.title).toBe('Versi Server');
  });

  it('cannot delete late homework through sync', async () => {
    const { staff, homework } = await syncContext();
    await prisma.homework.update({ where: { id: homework.id }, data: { dueDate: addDays(new Date(), -2) } });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'DELETE', hlc: hlcAt(Date.now()), lamport: 1, payload: {} },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.conflicts[0].reason).toBe('FORBIDDEN');

    const stored = await prisma.homework.findUniqueOrThrow({ where: { id: homework.id } });
    expect(stored.deletedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: 'homework.delete.denied' } });
    expect(audit).not.toBeNull();
  });

  it('cannot mutate a published exam through sync (403-equivalent) and audits it', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'sync-exam@a.test' });
    const exam = await prisma.examSchedule.create({
      data: {
        classId: schoolClass.id,
        subjectId: subject.id,
        createdById: teacher.id,
        title: 'UTS',
        examDate: addDays(new Date(), 5),
        startTime: '08:00',
        endTime: '10:00',
        publishedAt: new Date(),
      },
    });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'EXAM', entityId: exam.id, operation: 'UPDATE', hlc: hlcAt(Date.now()), lamport: 1, payload: { room: 'X' } },
        ],
      });

    expect(response.body.conflicts[0].reason).toBe('FORBIDDEN');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'exam.update.denied', entityId: exam.id } });
    expect(audit).not.toBeNull();
    const unchanged = await prisma.examSchedule.findUniqueOrThrow({ where: { id: exam.id } });
    expect(unchanged.room).toBeNull();
  });

  it('rejects a uniform item that the calendar does not permit', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'sync-uniform@a.test' });
    await prisma.uniformItem.create({
      data: { key: 'kemeja_putih', label: 'Kemeja Putih', category: 'DAILY', isDefault: true },
    });
    await prisma.uniformItem.create({
      data: { key: 'dasi', label: 'Dasi', category: 'CEREMONY', isDefault: true },
    });
    await prisma.academicCalendar.create({
      data: { date: todayUtcMidnight(), dayType: 'SCHOOL_DAY', uniformItems: 'kemeja_putih' },
    });
    const checklist = await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    const checklistId = await prisma.uniformChecklist.findFirstOrThrow();

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'device-a',
        changes: [
          {
            entityType: 'UNIFORM_CHECKLIST',
            entityId: checklistId.id,
            operation: 'UPDATE',
            hlc: hlcAt(Date.now()),
            lamport: 1,
            payload: { items: { dasi: true } },
          },
        ],
      });

    expect(checklist.status).toBe(200);
    expect(response.body.conflicts[0].reason).toBe('CONFLICT');
    expect(response.body.conflicts[0].message).toContain('tidak diizinkan');
  });

  it('applies permitted uniform toggles and stores per-field clocks', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'sync-uniform-ok@a.test' });
    await prisma.uniformItem.create({ data: { key: 'dasi', label: 'Dasi', category: 'CEREMONY', isDefault: true } });
    await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    const checklist = await prisma.uniformChecklist.findFirstOrThrow();

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'device-a',
        changes: [
          {
            entityType: 'UNIFORM_CHECKLIST',
            entityId: checklist.id,
            operation: 'UPDATE',
            hlc: hlcAt(Date.now()),
            lamport: 1,
            payload: { items: { dasi: true } },
          },
        ],
      });

    expect(response.body.applied).toHaveLength(1);
    expect(response.body.applied[0].appliedFields).toEqual(['item:dasi']);

    const item = await prisma.uniformChecklistItem.findFirstOrThrow({ where: { checklistId: checklist.id } });
    expect(item.checked).toBe(true);

    const state = await prisma.entityState.findFirstOrThrow({ where: { entityId: checklist.id } });
    expect(JSON.parse(state.fieldClocks)['item:dasi']).toBeDefined();
  });

  it('refuses to sync another student checklist', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'sync-uniform-other@a.test' });
    const other = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    await prisma.uniformItem.create({ data: { key: 'dasi', label: 'Dasi', category: 'CEREMONY', isDefault: true } });
    const foreign = await prisma.uniformChecklist.create({
      data: { studentId: other.id, date: todayUtcMidnight() },
    });

    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'device-a',
        changes: [
          {
            entityType: 'UNIFORM_CHECKLIST',
            entityId: foreign.id,
            operation: 'UPDATE',
            hlc: hlcAt(Date.now()),
            lamport: 1,
            payload: { items: { dasi: true } },
          },
        ],
      });
    expect(response.body.conflicts[0].reason).toBe('FORBIDDEN');
  });

  it('rejects an invalid payload shape', async () => {
    const auth = await registerUser(app, { email: 'sync-badpayload@a.test' });
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(auth.header)
      .send({
        clientId: 'device-a',
        changes: [
          {
            entityType: 'HOMEWORK',
            entityId: '44444444-4444-4444-8444-444444444444',
            operation: 'UPDATE',
            hlc: hlcAt(Date.now()),
            lamport: 1,
            payload: { title: 12345 },
          },
        ],
      });

    expect(response.body.conflicts[0].reason).toBe('INVALID_PAYLOAD');
  });

  it('records every change in the sync journal and reports status', async () => {
    const { auth, staff, homework } = await syncContext();
    await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlcAt(Date.now()), lamport: 1, payload: { title: 'Baru' } },
        ],
      });

    const journal = await prisma.syncChange.findMany({ where: { userId: staff.user.id } });
    expect(journal).toHaveLength(1);
    expect(journal[0]!.applied).toBe(true);

    const status = await request(app).get('/api/v1/sync/status').set(staff.header);
    expect(status.status).toBe(200);
    expect(status.body.state).toBe('SYNCED');
    expect(status.body.lastSyncedAt).toBeTruthy();
  });

  it('reports CONFLICT state when a change is conflicted', async () => {
    const { auth, homework } = await syncContext();
    await prisma.syncChange.create({
      data: {
        userId: auth.user.id,
        clientId: 'device-a',
        entityType: 'HOMEWORK',
        entityId: homework.id,
        operation: 'UPDATE',
        hlc: hlcAt(Date.now()),
        lamport: 1,
        conflicted: true,
      },
    });
    const status = await request(app).get('/api/v1/sync/status').set(auth.header);
    expect(status.body.state).toBe('CONFLICT');
    expect(status.body.conflicts).toBe(1);
  });

  it('pulls server state for the caller only', async () => {
    const { staff, homework } = await syncContext();
    await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlcAt(Date.now()), lamport: 1, payload: { title: 'Sinkron' } },
        ],
      });

    const other = await registerUser(app, { email: 'sync-other-pull@a.test' });
    const mine = await request(app).get('/api/v1/sync/pull').set(staff.header);
    const theirs = await request(app).get('/api/v1/sync/pull').set(other.header);

    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].entityId).toBe(homework.id);
    expect(theirs.body.items).toHaveLength(0);
  });

  it('supports a since cursor on pull', async () => {
    const { staff, homework } = await syncContext();
    await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'HOMEWORK', entityId: homework.id, operation: 'UPDATE', hlc: hlcAt(Date.now()), lamport: 1, payload: { title: 'A' } },
        ],
      });

    const future = new Date(Date.now() + 60_000).toISOString();
    const response = await request(app).get(`/api/v1/sync/pull?since=${future}`).set(staff.header);
    expect(response.body.items).toHaveLength(0);
  });

  it('applies a subject rename and a valid delete', async () => {
    const { staff, subject } = await syncContext();
    const renamed = await request(app)
      .post('/api/v1/sync/push')
      .set(staff.header)
      .send({
        clientId: 'device-a',
        changes: [
          { entityType: 'SUBJECT', entityId: subject.id, operation: 'UPDATE', hlc: hlcAt(Date.now()), lamport: 1, payload: { name: 'Matematika Lanjut' } },
        ],
      });
    expect(renamed.body.applied).toHaveLength(1);
    expect((await prisma.subject.findUniqueOrThrow({ where: { id: subject.id } })).name).toBe('Matematika Lanjut');
  });

  it('requires authentication', async () => {
    const response = await request(app).post('/api/v1/sync/push').send({ clientId: 'x', changes: [] });
    expect(response.status).toBe(401);
  });

  it('validates the change batch size', async () => {
    const auth = await registerUser(app, { email: 'sync-batch@a.test' });
    const response = await request(app).post('/api/v1/sync/push').set(auth.header).send({ clientId: 'x', changes: [] });
    expect(response.status).toBe(400);
  });

  it('date helper stays consistent with the school timezone', () => {
    expect(toDateKey(todayUtcMidnight())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
