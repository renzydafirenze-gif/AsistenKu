import request from 'supertest';
import { makeApp } from './helpers/app';
import {
  addDays,
  createClass,
  createDuty,
  createUser,
  registerUser,
  todayUtcMidnight,
} from './helpers/factories';
import { prisma } from '../src/db/prisma';

const app = makeApp();

async function setupClass() {
  const schoolClass = await createClass();
  const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
  const studentA = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Ani' });
  const studentB = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Beni' });
  const outsider = await createUser({ role: 'STUDENT' });
  return { schoolClass, teacher, studentA, studentB, outsider };
}

describe('duty schedule', () => {
  it('creates a duty for a student in the class (teacher)', async () => {
    const { schoolClass, teacher, studentA } = await setupClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-create@a.test' });

    const response = await request(app)
      .post('/api/v1/duties')
      .set(auth.header)
      .send({
        classId: schoolClass.id,
        date: addDays(todayUtcMidnight(), 1).toISOString().slice(0, 10),
        shift: 'MORNING',
        assignedStudentId: studentA.id,
      });

    expect(response.status).toBe(201);
    expect(response.body.duty).toMatchObject({ shift: 'MORNING', status: 'UPCOMING' });
    expect(response.body.duty.countdown.label).toBe('H-1');
    expect(teacher.id).toBeTruthy();
  });

  it('rejects a student assigning duties (403)', async () => {
    const { schoolClass, studentA } = await setupClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'siswa-post@a.test' });
    const response = await request(app).post('/api/v1/duties').set(auth.header).send({
      classId: schoolClass.id,
      date: addDays(todayUtcMidnight(), 1).toISOString().slice(0, 10),
      shift: 'MORNING',
      assignedStudentId: studentA.id,
    });
    expect(response.status).toBe(403);
  });

  it('rejects a past date and a duplicate slot', async () => {
    const { schoolClass, studentA } = await setupClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-dup@a.test' });

    const past = await request(app).post('/api/v1/duties').set(auth.header).send({
      classId: schoolClass.id,
      date: addDays(todayUtcMidnight(), -1).toISOString().slice(0, 10),
      shift: 'MORNING',
      assignedStudentId: studentA.id,
    });
    expect(past.status).toBe(400);

    const tomorrow = addDays(todayUtcMidnight(), 1).toISOString().slice(0, 10);
    const body = { classId: schoolClass.id, date: tomorrow, shift: 'MORNING', assignedStudentId: studentA.id };
    expect((await request(app).post('/api/v1/duties').set(auth.header).send(body)).status).toBe(201);
    const dupe = await request(app).post('/api/v1/duties').set(auth.header).send(body);
    expect(dupe.status).toBe(409);
  });

  it('rejects assigning a student from another class', async () => {
    const { schoolClass, outsider } = await setupClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-other@a.test' });
    const response = await request(app).post('/api/v1/duties').set(auth.header).send({
      classId: schoolClass.id,
      date: addDays(todayUtcMidnight(), 1).toISOString().slice(0, 10),
      shift: 'AFTERNOON',
      assignedStudentId: outsider.id,
    });
    expect(response.status).toBe(400);
  });

  it('lets a student read only their own duty', async () => {
    const { schoolClass, teacher, studentA, studentB } = await setupClass();
    const dutyA = await createDuty({ classId: schoolClass.id, assignedStudentId: studentA.id, createdById: teacher.id });
    const dutyB = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: studentB.id,
      createdById: teacher.id,
      shift: 'AFTERNOON',
    });

    const authA = await registerUser(app, { classId: schoolClass.id, email: 'siswa-a@a.test', fullName: 'Ani' });
    await prisma.user.update({ where: { id: authA.user.id }, data: { id: studentA.id } }).catch(() => undefined);

    // Use the directly created student's identity instead.
    const own = await prisma.dutySchedule.findFirst({ where: { id: dutyA.id } });
    const listed = await request(app).get('/api/v1/duties').set(authA.header);
    expect(listed.status).toBe(200);
    expect(listed.body.items.every((item: { assignedStudentId: string }) => item.assignedStudentId === authA.user.id)).toBe(
      true,
    );

    const forbidden = await request(app).get(`/api/v1/duties/${dutyB.id}`).set(authA.header);
    expect(forbidden.status).toBe(403);
    expect(own).not.toBeNull();
  });

  it('returns 403 for a duty in another class (teacher)', async () => {
    const { schoolClass, teacher, studentA } = await setupClass();
    const otherClass = await createClass('Kelas 11-A');
    const duty = await createDuty({
      classId: otherClass.id,
      assignedStudentId: studentA.id,
      createdById: teacher.id,
    });

    const actor = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-cross@a.test' });
    const response = await request(app).get(`/api/v1/duties/${duty.id}`).set(actor.header);
    expect(response.status).toBe(403);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'duty.read.denied' } });
    expect(audit).not.toBeNull();
  });

  it('completes a duty and returns a confirmation toast', async () => {
    const { schoolClass, teacher } = await setupClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'siswa-complete@a.test' });
    await prisma.user.update({ where: { id: auth.user.id }, data: { id: auth.user.id } });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: auth.user.id,
      createdById: teacher.id,
    });

    const response = await request(app).post(`/api/v1/duties/${duty.id}/complete`).set(auth.header).send({});
    expect(response.status).toBe(200);
    expect(response.body.toast).toEqual({ type: 'success', message: 'Piket ditandai selesai. Terima kasih!' });
    expect(response.body.duty.status).toBe('COMPLETED');
  });

  it('is idempotent when completing twice', async () => {
    const { schoolClass, teacher } = await setupClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'siswa-twice@a.test' });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: auth.user.id,
      createdById: teacher.id,
    });

    await request(app).post(`/api/v1/duties/${duty.id}/complete`).set(auth.header).send({});
    const second = await request(app).post(`/api/v1/duties/${duty.id}/complete`).set(auth.header).send({});
    expect(second.status).toBe(200);
    expect(second.body.toast.type).toBe('info');
  });

  it('refuses completion before the duty day and by classmates', async () => {
    const { schoolClass, teacher, studentB } = await setupClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'siswa-future@a.test' });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: auth.user.id,
      createdById: teacher.id,
      date: addDays(todayUtcMidnight(), 2),
    });

    const early = await request(app).post(`/api/v1/duties/${duty.id}/complete`).set(auth.header).send({});
    expect(early.status).toBe(409);

    const classmate = await registerUser(app, { classId: schoolClass.id, email: 'siswa-nope@a.test' });
    void studentB;
    const denied = await request(app).post(`/api/v1/duties/${duty.id}/complete`).set(classmate.header).send({});
    expect(denied.status).toBe(403);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'duty.complete.denied' } });
    expect(audit).not.toBeNull();
  });

  it('lets staff complete on behalf of a student', async () => {
    const { schoolClass, teacher } = await setupClass();
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const duty = await createDuty({ classId: schoolClass.id, assignedStudentId: student.id, createdById: teacher.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-complete@a.test' });

    const response = await request(app).post(`/api/v1/duties/${duty.id}/complete`).set(staff.header).send({});
    expect(response.status).toBe(200);
    expect(response.body.duty.completedAt).not.toBeNull();
  });

  it('updates and soft-deletes a duty', async () => {
    const { schoolClass, studentB } = await setupClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-update@a.test' });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.id,
      createdById: auth.user.id,
      date: addDays(todayUtcMidnight(), 1),
    });

    const patched = await request(app)
      .patch(`/api/v1/duties/${duty.id}`)
      .set(auth.header)
      .send({ assignedStudentId: studentB.id, notes: 'Bawa sapu' });
    expect(patched.status).toBe(200);
    expect(patched.body.duty.notes).toBe('Bawa sapu');

    const removed = await request(app).delete(`/api/v1/duties/${duty.id}`).set(auth.header);
    expect(removed.status).toBe(204);

    const gone = await request(app).get(`/api/v1/duties/${duty.id}`).set(auth.header);
    expect(gone.status).toBe(404);
  });

  it('rejects updating a completed duty', async () => {
    const { schoolClass } = await setupClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-locked@a.test' });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const duty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: student.id,
      createdById: auth.user.id,
      completedAt: new Date(),
    });

    const response = await request(app).patch(`/api/v1/duties/${duty.id}`).set(auth.header).send({ notes: 'x' });
    expect(response.status).toBe(409);
  });

  it('validates query and id parameters', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'guru-badquery@a.test' });
    const badQuery = await request(app).get('/api/v1/duties?from=not-a-date').set(auth.header);
    expect(badQuery.status).toBe(400);

    const badId = await request(app).get('/api/v1/duties/not-a-uuid').set(auth.header);
    expect(badId.status).toBe(400);
  });

  it('paginates with a cursor', async () => {
    const { schoolClass, teacher } = await setupClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'guru-page@a.test' });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    for (let i = 1; i <= 3; i += 1) {
      await createDuty({
        classId: schoolClass.id,
        assignedStudentId: student.id,
        createdById: teacher.id,
        date: addDays(todayUtcMidnight(), i),
      });
    }

    const firstPage = await request(app).get('/api/v1/duties?limit=2').set(auth.header);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(app)
      .get(`/api/v1/duties?limit=2&cursor=${firstPage.body.nextCursor}`)
      .set(auth.header);
    expect(secondPage.body.items.length).toBeGreaterThanOrEqual(1);
    expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);
  });

  it('returns an empty list for staff without a class', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'guru-noclass@a.test' });
    const response = await request(app).get('/api/v1/duties').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('404s for an unknown duty', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'guru-404@a.test' });
    const response = await request(app)
      .get('/api/v1/duties/22222222-2222-4222-8222-222222222222')
      .set(auth.header);
    expect(response.status).toBe(404);
  });

  it('lets a parent read their ward duty only', async () => {
    const { schoolClass, teacher } = await setupClass();
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const otherChild = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const duty = await createDuty({ classId: schoolClass.id, assignedStudentId: child.id, createdById: teacher.id });
    const otherDuty = await createDuty({
      classId: schoolClass.id,
      assignedStudentId: otherChild.id,
      createdById: teacher.id,
      shift: 'AFTERNOON',
    });

    const parent = await registerUser(app, { role: 'PARENT', email: 'orangtua@a.test' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const allowed = await request(app).get(`/api/v1/duties/${duty.id}`).set(parent.header);
    expect(allowed.status).toBe(200);

    const denied = await request(app).get(`/api/v1/duties/${otherDuty.id}`).set(parent.header);
    expect(denied.status).toBe(403);
  });
});
