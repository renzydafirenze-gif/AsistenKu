import request from 'supertest';
import { makeApp } from './helpers/app';
import {
  addDays,
  createClass,
  createHomework,
  createSubject,
  createUser,
  registerUser,
} from './helpers/factories';
import { prisma } from '../src/db/prisma';

const app = makeApp();
const FUTURE = () => addDays(new Date(), 3).toISOString();
const PAST = () => addDays(new Date(), -2).toISOString();

async function classContext() {
  const schoolClass = await createClass();
  const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
  const student = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Siswa Satu' });
  const otherStudent = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Siswa Dua' });
  const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id, code: `MTK${Math.random().toString(36).slice(2, 7)}` });
  return { schoolClass, teacher, student, otherStudent, subject };
}

describe('homework management', () => {
  it('lets a teacher create homework for their class', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-create@a.test' });

    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, classId: schoolClass.id, title: 'Latihan Aljabar', dueDate: FUTURE() });

    expect(response.status).toBe(201);
    expect(response.body.homework).toMatchObject({ title: 'Latihan Aljabar', status: 'PENDING' });
    expect(response.body.homework.permissions.canGrade).toBe(false);
  });

  it('rejects a due date in the past', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-past@a.test' });
    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, classId: schoolClass.id, title: 'Telat', dueDate: PAST() });
    expect(response.status).toBe(400);
  });

  it('lets a student create a personal task', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-personal@a.test' });

    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, title: 'Tugas Pribadi', dueDate: FUTURE() });

    expect(response.status).toBe(201);
    expect(response.body.homework.permissions.canDelete).toBe(true);
    expect(response.body.homework.permissions.canEdit).toBe(true);
  });

  it('prevents a student from creating class-wide homework', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-classwide@a.test' });
    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, classId: schoolClass.id, title: 'Nope', dueDate: FUTURE() });
    expect(response.status).toBe(403);
  });

  it('lists homework with a red highlight for late tasks', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-list@a.test' });

    await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      title: 'Terlambat',
      dueDate: addDays(new Date(), -1),
    });
    await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      title: 'Masih Waktu',
      dueDate: addDays(new Date(), 4),
    });

    const response = await request(app).get('/api/v1/homework').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);

    const late = response.body.items.find((item: { title: string }) => item.title === 'Terlambat');
    expect(late.isLate).toBe(true);
    expect(late.accentColor).toBe('#C0392B');
    expect(late.status).toBe('PENDING');

    const upcoming = response.body.items.find((item: { title: string }) => item.title === 'Masih Waktu');
    expect(upcoming.isLate).toBe(false);
    expect(upcoming.accentColor).not.toBe('#C0392B');
  });

  it('submits homework and records the submission', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-submit@a.test' });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });

    const response = await request(app).post(`/api/v1/homework/${homework.id}/submit`).set(auth.header).send({});
    expect(response.status).toBe(200);
    expect(response.body.homework.status).toBe('SUBMITTED');
    expect(response.body.homework.submittedAt).toBeTruthy();
    expect(response.body.homework.permissions.canSubmit).toBe(false);

    const submission = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } });
    expect(submission.studentId).toBe(auth.user.id);
    expect(submission.isLate).toBe(false);
  });

  it('flags a late submission as late', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-late-submit@a.test' });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), -1),
    });

    const response = await request(app).post(`/api/v1/homework/${homework.id}/submit`).set(auth.header).send({});
    expect(response.status).toBe(200);
    expect(response.body.homework.isLate).toBe(true);
    expect(response.body.homework.accentColor).toBe('#C0392B');
  });

  it('prevents deletion of late homework, even by the teacher, and audits it', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), -1),
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-late-del@a.test' });
    const response = await request(app).delete(`/api/v1/homework/${homework.id}`).set(auth.header);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('terlambat');

    const stillThere = await prisma.homework.findFirst({ where: { id: homework.id } });
    expect(stillThere?.deletedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'homework.delete.denied', entityId: homework.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.metadata).reason).toBe('LATE_HOMEWORK_IMMUTABLE');
  });

  it('prevents a student deleting a personal late task', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-personal-late@a.test' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: auth.user.id,
      ownerStudentId: auth.user.id,
      dueDate: addDays(new Date(), -3),
    });

    const response = await request(app).delete(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('allows deleting homework that is not late', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-del-ok@a.test' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: auth.user.id,
      ownerStudentId: auth.user.id,
      dueDate: addDays(new Date(), 5),
    });

    const response = await request(app).delete(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(204);
    const stored = await prisma.homework.findFirstOrThrow({ where: { id: homework.id } });
    expect(stored.deletedAt).not.toBeNull();
  });

  it('updates homework before it is graded', async () => {
    const { schoolClass, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-edit@a.test' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: auth.user.id,
      ownerStudentId: auth.user.id,
      dueDate: addDays(new Date(), 4),
    });

    const response = await request(app)
      .patch(`/api/v1/homework/${homework.id}`)
      .set(auth.header)
      .send({ title: 'Judul Baru' });
    expect(response.status).toBe(200);
    expect(response.body.homework.title).toBe('Judul Baru');
  });

  it('blocks editing a task that has been graded', async () => {
    const { schoolClass, teacher, student, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'GRADED', grade: 90, submittedAt: new Date() },
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-graded@a.test' });
    const response = await request(app).patch(`/api/v1/homework/${homework.id}`).set(auth.header).send({ title: 'X' });
    expect(response.status).toBe(409);
  });

  it('grades a submission and stores feedback', async () => {
    const { schoolClass, teacher, student, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-grade@a.test' });
    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(auth.header)
      .send({ studentId: student.id, grade: 92, feedback: 'Kerja bagus' });

    expect(response.status).toBe(200);
    expect(response.body.submission).toMatchObject({ grade: 92, feedback: 'Kerja bagus', status: 'GRADED' });
  });

  it('rejects grading a task the student has not submitted', async () => {
    const { schoolClass, teacher, student, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-nosub@a.test' });

    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(auth.header)
      .send({ studentId: student.id, grade: 80 });
    expect(response.status).toBe(409);
  });

  it('rejects a grade outside 0-100', async () => {
    const { schoolClass, teacher, student, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-badgrade@a.test' });
    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(auth.header)
      .send({ studentId: student.id, grade: 150 });
    expect(response.status).toBe(400);
  });

  it('forbids students from grading', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-nograde@a.test' });
    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(auth.header)
      .send({ studentId: auth.user.id, grade: 100 });
    expect(response.status).toBe(403);
  });

  it('returns a roster of submissions for staff', async () => {
    const { schoolClass, teacher, student, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'g-roster@a.test' });
    const response = await request(app).get(`/api/v1/homework/${homework.id}/submissions`).set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThanOrEqual(2);
    const row = response.body.items.find((item: { studentId: string }) => item.studentId === student.id);
    expect(row.status).toBe('SUBMITTED');
  });

  it('hides homework from students in another class', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });

    const otherClass = await createClass('Kelas 12-B');
    const auth = await registerUser(app, { classId: otherClass.id, email: 's-otherclass@a.test' });
    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(403);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'homework.read.denied' } });
    expect(audit).not.toBeNull();
  });

  it('filters by status and lateOnly', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-filter@a.test' });
    const late = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), -1),
    });
    await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 6),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: late.id, studentId: auth.user.id, status: 'SUBMITTED', submittedAt: new Date(), isLate: true },
    });

    const lateOnly = await request(app).get('/api/v1/homework?lateOnly=true').set(auth.header);
    expect(lateOnly.body.items.every((item: { isLate: boolean }) => item.isLate)).toBe(true);

    const submitted = await request(app).get('/api/v1/homework?status=SUBMITTED').set(auth.header);
    expect(submitted.body.items).toHaveLength(1);
  });

  it('exposes the detail view with permissions', async () => {
    const { schoolClass, teacher, subject } = await classContext();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 's-detail@a.test' });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });

    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.homework.permissions).toEqual({
      canEdit: false,
      canDelete: false,
      canSubmit: true,
      canGrade: false,
    });
  });
});
