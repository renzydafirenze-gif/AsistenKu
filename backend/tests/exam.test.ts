import request from 'supertest';
import { makeApp } from './helpers/app';
import { addDays, createClass, createExam, createSubject, createUser, registerUser } from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { toDateKey } from '../src/lib/dates';

const app = makeApp();

async function examContext() {
  const schoolClass = await createClass();
  const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
  const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
  return { schoolClass, teacher, subject };
}

describe('exam schedule', () => {
  it('creates a draft exam', async () => {
    const { schoolClass, subject } = await examContext();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-create@a.test' });

    const response = await request(app).post('/api/v1/exams').set(auth.header).send({
      classId: schoolClass.id,
      subjectId: subject.id,
      title: 'UTS Matematika',
      examDate: toDateKey(addDays(new Date(), 10)),
      startTime: '08:00',
      endTime: '10:00',
      room: 'R-101',
    });

    expect(response.status).toBe(201);
    expect(response.body.exam).toMatchObject({ isPublished: false, isLocked: false });
  });

  it('rejects an end time before the start time', async () => {
    const { schoolClass, subject } = await examContext();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-time@a.test' });
    const response = await request(app).post('/api/v1/exams').set(auth.header).send({
      classId: schoolClass.id,
      subjectId: subject.id,
      title: 'Salah Jam',
      examDate: toDateKey(addDays(new Date(), 10)),
      startTime: '10:00',
      endTime: '09:00',
    });
    expect(response.status).toBe(400);
  });

  it('rejects duplicate slots', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-dup@a.test' });
    const body = {
      classId: schoolClass.id,
      subjectId: subject.id,
      title: 'UTS',
      examDate: toDateKey(addDays(new Date(), 10)),
      startTime: '08:00',
      endTime: '10:00',
    };
    expect((await request(app).post('/api/v1/exams').set(auth.header).send(body)).status).toBe(201);
    expect((await request(app).post('/api/v1/exams').set(auth.header).send(body)).status).toBe(400);
    expect(teacher.id).toBeTruthy();
  });

  it('locks a published exam: update returns 403 and writes an audit entry', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const exam = await createExam({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      publishedAt: new Date(),
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-lock@a.test' });
    const response = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set(auth.header)
      .send({ room: 'R-999' });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('dipublikasikan');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'exam.update.denied', entityId: exam.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.metadata).reason).toBe('PUBLISHED_EXAM_IMMUTABLE');

    const unchanged = await prisma.examSchedule.findUniqueOrThrow({ where: { id: exam.id } });
    expect(unchanged.room).toBeNull();
  });

  it('blocks deleting a published exam and audits the attempt', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const exam = await createExam({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      publishedAt: new Date(),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-del@a.test' });

    const response = await request(app).delete(`/api/v1/exams/${exam.id}`).set(auth.header);
    expect(response.status).toBe(403);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'exam.update.denied', entityId: exam.id } });
    expect(audit).not.toBeNull();
  });

  it('allows editing and deleting while still a draft', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-draft@a.test' });

    const patched = await request(app).patch(`/api/v1/exams/${exam.id}`).set(auth.header).send({ room: 'R-202' });
    expect(patched.status).toBe(200);
    expect(patched.body.exam.room).toBe('R-202');

    const removed = await request(app).delete(`/api/v1/exams/${exam.id}`).set(auth.header);
    expect(removed.status).toBe(204);
  });

  it('publishes an exam and makes it visible to students', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-exam-pub@a.test' });

    const hidden = await request(app).get('/api/v1/exams').set((await registerUser(app, { classId: schoolClass.id, email: 's-exam-pre@a.test' })).header);
    expect(hidden.body.items).toHaveLength(0);

    const published = await request(app)
      .post(`/api/v1/exams/${exam.id}/publish`)
      .set(staff.header)
      .send({ published: true });
    expect(published.status).toBe(200);
    expect(published.body.exam.isLocked).toBe(true);

    const student = await registerUser(app, { classId: schoolClass.id, email: 's-exam-post@a.test' });
    const visible = await request(app).get('/api/v1/exams').set(student.header);
    expect(visible.body.items).toHaveLength(1);

    // Publishing twice is idempotent.
    const again = await request(app).post(`/api/v1/exams/${exam.id}/publish`).set(staff.header).send({ published: true });
    expect(again.status).toBe(200);
  });

  it('keeps drafts invisible to students even by direct id', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const student = await registerUser(app, { classId: schoolClass.id, email: 's-exam-draft@a.test' });

    const response = await request(app).get(`/api/v1/exams/${exam.id}`).set(student.header);
    expect(response.status).toBe(403);
  });

  it('refuses exam creation by students', async () => {
    const { schoolClass, subject } = await examContext();
    const student = await registerUser(app, { classId: schoolClass.id, email: 's-exam-create@a.test' });
    const response = await request(app).post('/api/v1/exams').set(student.header).send({
      classId: schoolClass.id,
      subjectId: subject.id,
      title: 'Nope',
      examDate: toDateKey(addDays(new Date(), 3)),
      startTime: '08:00',
      endTime: '09:00',
    });
    expect(response.status).toBe(403);
  });

  it('returns a calendar window', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    await createExam({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      examDate: addDays(new Date(), 4),
      publishedAt: new Date(),
    });
    const student = await registerUser(app, { classId: schoolClass.id, email: 's-exam-cal@a.test' });

    const from = toDateKey(addDays(new Date(), -5));
    const to = toDateKey(addDays(new Date(), 30));
    const response = await request(app).get(`/api/v1/exams?from=${from}&to=${to}`).set(student.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].daysUntil).toBeGreaterThan(0);
  });

  it('blocks a teacher from another class', async () => {
    const { schoolClass, subject, teacher } = await examContext();
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const otherClass = await createClass('Kelas 12-C');
    const outsider = await registerUser(app, { role: 'TEACHER', classId: otherClass.id, email: 'g-exam-other@a.test' });

    const response = await request(app).patch(`/api/v1/exams/${exam.id}`).set(outsider.header).send({ room: 'X' });
    expect(response.status).toBe(403);
  });
});
