import request from 'supertest';
import { makeApp } from './helpers/app';
import {
  addDays,
  createClass,
  createExam,
  createHomework,
  createSubject,
  createUser,
  registerUser,
} from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { toDateKey } from '../src/lib/dates';
import { assertSameClass, requireRole } from '../src/middleware/auth';
import { ForbiddenError, UnauthorizedError } from '../src/lib/errors';

const app = makeApp();

describe('homework edge cases', () => {
  it('returns a student view for a personal task with no submission', async () => {
    const schoolClass = await createClass();
    const subject = await createSubject({ classId: schoolClass.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'hw-personal-view@a.test' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: auth.user.id,
      ownerStudentId: auth.user.id,
      dueDate: addDays(new Date(), 2),
    });

    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.homework.assignment).toMatchObject({ studentId: auth.user.id });
    expect(response.body.homework.status).toBe('PENDING');
  });

  it('rejects resubmitting a graded task', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'hw-regrade@a.test' });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: auth.user.id, status: 'GRADED', grade: 88, submittedAt: new Date() },
    });

    const response = await request(app).post(`/api/v1/homework/${homework.id}/submit`).set(auth.header).send({});
    expect(response.status).toBe(409);
  });

  it('rejects submitting a task from another class', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    const otherClass = await createClass('Kelas 11-Q');
    const auth = await registerUser(app, { classId: otherClass.id, email: 'hw-submit-other@a.test' });

    const response = await request(app).post(`/api/v1/homework/${homework.id}/submit`).set(auth.header).send({});
    expect(response.status).toBe(403);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'homework.submit.denied' } });
    expect(audit).not.toBeNull();
  });

  it('rejects an unknown subject and an unknown homework', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'hw-unknown@a.test' });
    const badSubject = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({
        subjectId: '66666666-6666-4666-8666-666666666666',
        title: 'X',
        dueDate: addDays(new Date(), 2).toISOString(),
      });
    expect(badSubject.status).toBe(404);

    const missing = await request(app)
      .get('/api/v1/homework/77777777-7777-4777-8777-777777777777')
      .set(auth.header);
    expect(missing.status).toBe(404);
  });

  it('requires a class for staff homework creation', async () => {
    const subject = await createSubject({});
    const auth = await registerUser(app, { role: 'TEACHER', email: 'hw-noclass@a.test' });
    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, title: 'X', dueDate: addDays(new Date(), 2).toISOString() });
    expect(response.status).toBe(400);
  });

  it('rejects a subject belonging to a different class', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 12-F');
    const subject = await createSubject({ classId: otherClass.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'hw-subject-class@a.test' });

    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, classId: schoolClass.id, title: 'X', dueDate: addDays(new Date(), 2).toISOString() });
    expect(response.status).toBe(400);
  });

  it('rejects updating homework by a non-owner student', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 3),
    });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'hw-nonowner@a.test' });

    const response = await request(app).patch(`/api/v1/homework/${homework.id}`).set(auth.header).send({ title: 'X' });
    expect(response.status).toBe(403);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'homework.update.denied' } });
    expect(audit).not.toBeNull();
  });

  it('freezes a late personal task against edits', async () => {
    const subject = await createSubject({});
    const auth = await registerUser(app, { email: 'hw-late-edit@a.test' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: auth.user.id,
      ownerStudentId: auth.user.id,
      dueDate: addDays(new Date(), -1),
    });

    const response = await request(app).patch(`/api/v1/homework/${homework.id}`).set(auth.header).send({ title: 'X' });
    expect(response.status).toBe(403);
  });

  it('rejects a new due date in the past on update', async () => {
    const subject = await createSubject({});
    const auth = await registerUser(app, { email: 'hw-past-update@a.test' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: auth.user.id,
      ownerStudentId: auth.user.id,
      dueDate: addDays(new Date(), 3),
    });

    const response = await request(app)
      .patch(`/api/v1/homework/${homework.id}`)
      .set(auth.header)
      .send({ dueDate: addDays(new Date(), -1).toISOString() });
    expect(response.status).toBe(400);
  });

  it('rejects deleting another student task', async () => {
    const schoolClass = await createClass();
    const subject = await createSubject({ classId: schoolClass.id });
    const owner = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: owner.id,
      ownerStudentId: owner.id,
      dueDate: addDays(new Date(), 3),
    });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'hw-del-other@a.test' });

    const response = await request(app).delete(`/api/v1/homework/${homework.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('returns an empty list for staff without a class', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'hw-staff-noclass@a.test' });
    const response = await request(app).get('/api/v1/homework').set(auth.header);
    expect(response.body.items).toEqual([]);
  });

  it('returns an empty list for a parent without wards', async () => {
    const auth = await registerUser(app, { role: 'PARENT', email: 'hw-parent-noward@a.test' });
    const response = await request(app).get('/api/v1/homework').set(auth.header);
    expect(response.body.items).toEqual([]);
  });

  it('lets a parent see a ward submission', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'Anak Saya' });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 3),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: child.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const parent = await registerUser(app, { role: 'PARENT', email: 'hw-parent@a.test' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const list = await request(app).get('/api/v1/homework').set(parent.header);
    expect(list.status).toBe(200);
    const item = list.body.items.find((i: { id: string }) => i.id === homework.id);
    expect(item.assignment.studentName).toBe('Anak Saya');

    const detail = await request(app).get(`/api/v1/homework/${homework.id}`).set(parent.header);
    expect(detail.status).toBe(200);

    const subs = await request(app).get(`/api/v1/homework/${homework.id}/submissions`).set(parent.header);
    expect(subs.body.items[0].studentId).toBe(child.id);
  });

  it('refuses a parent accessing an unrelated homework', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 3),
    });
    const parent = await registerUser(app, { role: 'PARENT', email: 'hw-parent-unrelated@a.test' });

    const response = await request(app).get(`/api/v1/homework/${homework.id}`).set(parent.header);
    expect(response.status).toBe(403);
  });

  it('lets staff filter homework for one student', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 3),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'hw-staff-filter@a.test' });

    const response = await request(app).get(`/api/v1/homework?studentId=${teacher.id}`).set(auth.header);
    expect(response.status).toBe(200);
  });

  it('rejects staff reading another class homework list', async () => {
    const homeClass = await createClass('Kelas 12-G');
    const otherClass = await createClass('Kelas 12-G2');
    const auth = await registerUser(app, {
      role: 'TEACHER',
      classId: homeClass.id,
      email: 'hw-staff-cross@a.test',
    });
    const response = await request(app).get(`/api/v1/homework?classId=${otherClass.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('lets unscoped staff query an explicit class', async () => {
    const otherClass = await createClass('Kelas 12-G3');
    const auth = await registerUser(app, { role: 'TEACHER', email: 'hw-staff-unscoped@a.test' });
    const response = await request(app).get(`/api/v1/homework?classId=${otherClass.id}`).set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('returns submissions for a personal task to staff', async () => {
    const subject = await createSubject({});
    const student = await createUser({ role: 'STUDENT' });
    const homework = await createHomework({
      subjectId: subject.id,
      createdById: student.id,
      ownerStudentId: student.id,
      dueDate: addDays(new Date(), 2),
    });
    const auth = await registerUser(app, { role: 'TEACHER', email: 'hw-personal-staff@a.test' });

    const response = await request(app).get(`/api/v1/homework/${homework.id}/submissions`).set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items[0].studentId).toBe(student.id);
  });

  it('rejects grading by a teacher from another class', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    await prisma.homeworkSubmission.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const otherClass = await createClass('Kelas 12-H');
    const outsider = await registerUser(app, { role: 'TEACHER', classId: otherClass.id, email: 'hw-grade-other@a.test' });
    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(outsider.header)
      .send({ studentId: student.id, grade: 90 });
    expect(response.status).toBe(403);
  });

  it('rejects grading a student outside the homework class', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 12-I');
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const outsider = await createUser({ role: 'STUDENT', classId: otherClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'hw-grade-outside@a.test' });

    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(auth.header)
      .send({ studentId: outsider.id, grade: 90 });
    expect(response.status).toBe(400);
  });

  it('404s grading an unknown student', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const homework = await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'hw-grade-404@a.test' });
    const response = await request(app)
      .post(`/api/v1/homework/${homework.id}/grade`)
      .set(auth.header)
      .send({ studentId: '88888888-8888-4888-8888-888888888888', grade: 90 });
    expect(response.status).toBe(404);
  });

  it('accepts a date-only due date', async () => {
    const schoolClass = await createClass();
    const subject = await createSubject({ classId: schoolClass.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'hw-dateonly@a.test' });
    const response = await request(app)
      .post('/api/v1/homework')
      .set(auth.header)
      .send({ subjectId: subject.id, classId: schoolClass.id, title: 'X', dueDate: toDateKey(addDays(new Date(), 4)) });
    expect(response.status).toBe(201);
  });
});

describe('exam edge cases', () => {
  it('returns an empty calendar for a student without a class', async () => {
    const auth = await registerUser(app, { email: 'exam-noclass@a.test' });
    const response = await request(app).get('/api/v1/exams').set(auth.header);
    expect(response.body.items).toEqual([]);
  });

  it('returns an empty calendar for staff without a class', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'exam-staff-noclass@a.test' });
    const response = await request(app).get('/api/v1/exams').set(auth.header);
    expect(response.body.items).toEqual([]);
  });

  it('lets a parent read published exams for their ward class', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const exam = await createExam({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      publishedAt: new Date(),
    });

    const parent = await registerUser(app, { role: 'PARENT', email: 'exam-parent@a.test' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const list = await request(app).get('/api/v1/exams').set(parent.header);
    expect(list.body.items).toHaveLength(1);

    const detail = await request(app).get(`/api/v1/exams/${exam.id}`).set(parent.header);
    expect(detail.status).toBe(200);
  });

  it('returns an empty calendar for a parent without wards', async () => {
    const auth = await registerUser(app, { role: 'PARENT', email: 'exam-parent-noward@a.test' });
    const response = await request(app).get('/api/v1/exams').set(auth.header);
    expect(response.body.items).toEqual([]);
  });

  it('refuses a parent reading an unpublished exam', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });

    const parent = await registerUser(app, { role: 'PARENT', email: 'exam-parent-draft@a.test' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const response = await request(app).get(`/api/v1/exams/${exam.id}`).set(parent.header);
    expect(response.status).toBe(403);
  });

  it('404s an unknown exam', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'exam-404@a.test' });
    const response = await request(app).get('/api/v1/exams/99999999-9999-4999-8999-999999999999').set(auth.header);
    expect(response.status).toBe(404);
  });

  it('refuses creating an exam for an unknown subject', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'exam-nosubject@a.test' });
    const response = await request(app).post('/api/v1/exams').set(auth.header).send({
      classId: schoolClass.id,
      subjectId: '12121212-1212-4212-8212-121212121212',
      title: 'X',
      examDate: toDateKey(addDays(new Date(), 5)),
      startTime: '08:00',
      endTime: '09:00',
    });
    expect(response.status).toBe(404);
  });

  it('rejects an exam created directly as published without permission', async () => {
    const schoolClass = await createClass();
    const subject = await createSubject({ classId: schoolClass.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'exam-student-pub@a.test' });
    const response = await request(app).post('/api/v1/exams').set(auth.header).send({
      classId: schoolClass.id,
      subjectId: subject.id,
      title: 'X',
      examDate: toDateKey(addDays(new Date(), 5)),
      startTime: '08:00',
      endTime: '09:00',
      publish: true,
    });
    expect(response.status).toBe(403);
  });

  it('refuses publishing by a non-authoring role', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'exam-student-publish@a.test' });

    const response = await request(app)
      .post(`/api/v1/exams/${exam.id}/publish`)
      .set(auth.header)
      .send({ published: true });
    expect(response.status).toBe(403);
  });

  it('404s publishing an unknown exam', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'exam-pub-404@a.test' });
    const response = await request(app)
      .post('/api/v1/exams/34343434-3434-4434-8434-343434343434/publish')
      .set(auth.header)
      .send({ published: true });
    expect(response.status).toBe(404);
  });

  it('rejects an invalid exam time update', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'exam-badtime@a.test' });

    const response = await request(app).patch(`/api/v1/exams/${exam.id}`).set(auth.header).send({ endTime: '07:00' });
    expect(response.status).toBe(400);
  });

  it('rejects updating to an unknown subject', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'exam-sub-update@a.test' });

    const response = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set(auth.header)
      .send({ subjectId: '56565656-5656-4656-8656-565656565656' });
    expect(response.status).toBe(404);
  });

  it('filters by subject and publishedOnly', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const otherSubject = await createSubject({ classId: schoolClass.id, code: 'BIO2', name: 'Biologi' });
    await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id, publishedAt: new Date() });
    await createExam({ classId: schoolClass.id, subjectId: otherSubject.id, createdById: teacher.id });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'exam-filter@a.test' });
    const filtered = await request(app).get(`/api/v1/exams?subjectId=${subject.id}`).set(auth.header);
    expect(filtered.body.items).toHaveLength(1);

    const published = await request(app).get('/api/v1/exams?publishedOnly=true').set(auth.header);
    expect(published.body.items).toHaveLength(1);
  });

  it('refuses a student filtering another class', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 12-J');
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'exam-student-cross@a.test' });
    const response = await request(app).get(`/api/v1/exams?classId=${otherClass.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('refuses a teacher reading an exam from another class', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const otherClass = await createClass('Kelas 12-K');
    const outsider = await registerUser(app, { role: 'TEACHER', classId: otherClass.id, email: 'exam-cross-read@a.test' });

    const response = await request(app).get(`/api/v1/exams/${exam.id}`).set(outsider.header);
    expect(response.status).toBe(403);
  });

  it('refuses deleting by a non-authoring role', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id });
    const exam = await createExam({ classId: schoolClass.id, subjectId: subject.id, createdById: teacher.id });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'exam-del-student@a.test' });

    const response = await request(app).delete(`/api/v1/exams/${exam.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });
});

describe('auth middleware helpers', () => {
  it('assertSameClass rejects a cross-class staff request', () => {
    const req: any = { user: { id: 'u', role: 'TEACHER', classId: 'c1' } };
    expect(() => assertSameClass(req, 'c2')).toThrow(ForbiddenError);
    expect(() => assertSameClass(req, 'c1')).not.toThrow();
  });

  it('assertSameClass is a no-op for students and parents', () => {
    expect(() => assertSameClass({ user: { id: 'u', role: 'STUDENT', classId: 'c1' } } as any, 'c2')).not.toThrow();
    expect(() => assertSameClass({ user: { id: 'u', role: 'PARENT', classId: null } } as any, 'c2')).not.toThrow();
  });

  it('assertSameClass requires an authenticated user', () => {
    expect(() => assertSameClass({} as any, 'c1')).toThrow(UnauthorizedError);
  });

  it('requireRole allows listed roles and rejects others', () => {
    const next = jest.fn();
    requireRole('TEACHER')({ user: { role: 'TEACHER' } } as any, {} as never, next);
    expect(next).toHaveBeenCalledWith();

    const denied = jest.fn();
    requireRole('TEACHER')({ user: { role: 'STUDENT' } } as any, {} as never, denied);
    expect(denied.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);

    const anonymous = jest.fn();
    requireRole('TEACHER')({} as any, {} as never, anonymous);
    expect(anonymous.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});
