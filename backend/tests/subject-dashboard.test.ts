import request from 'supertest';
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
import { toDateKey } from '../src/lib/dates';

const app = makeApp();

describe('subjects', () => {
  it('lists subjects with teacher names and resource links', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id, fullName: 'Bu Sari' });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id, name: 'Fisika', code: 'FIS' });
    await prisma.subject.update({ where: { id: subject.id }, data: { resourceUrl: 'https://contoh.test/modul' } });

    const auth = await registerUser(app, { classId: schoolClass.id, email: 'sub-list@a.test' });
    const response = await request(app).get('/api/v1/subjects').set(auth.header);

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      name: 'Fisika',
      teacher: { fullName: 'Bu Sari' },
      resourceUrl: 'https://contoh.test/modul',
    });
  });

  it('creates, updates and deletes a subject (teacher)', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'sub-crud@a.test' });

    const created = await request(app)
      .post('/api/v1/subjects')
      .set(auth.header)
      .send({ code: 'BIO', name: 'Biologi', classId: schoolClass.id, resourceUrl: 'https://contoh.test/bio' });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/v1/subjects/${created.body.subject.id}`)
      .set(auth.header)
      .send({ resourceUrl: 'https://contoh.test/bio-v2' });
    expect(patched.status).toBe(200);
    expect(patched.body.subject.resourceUrl).toBe('https://contoh.test/bio-v2');

    const removed = await request(app).delete(`/api/v1/subjects/${created.body.subject.id}`).set(auth.header);
    expect(removed.status).toBe(204);
  });

  it('rejects duplicate subject codes', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'sub-dupe@a.test' });
    await request(app).post('/api/v1/subjects').set(auth.header).send({ code: 'KIM', name: 'Kimia' });
    const response = await request(app).post('/api/v1/subjects').set(auth.header).send({ code: 'KIM', name: 'Kimia 2' });
    expect(response.status).toBe(409);
  });

  it('rejects non-HTTPS resource links', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'sub-http@a.test' });
    const response = await request(app)
      .post('/api/v1/subjects')
      .set(auth.header)
      .send({ code: 'SEJ', name: 'Sejarah', resourceUrl: 'http://insecure.test/x' });
    expect(response.status).toBe(400);
  });

  it('forbids students from managing subjects', async () => {
    const auth = await registerUser(app, { email: 'sub-student@a.test' });
    const response = await request(app).post('/api/v1/subjects').set(auth.header).send({ code: 'SEN', name: 'Seni' });
    expect(response.status).toBe(403);
  });

  it('refuses to delete a subject that still has homework', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
    await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), 2),
    });

    const auth = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'sub-withhw@a.test' });
    const response = await request(app).delete(`/api/v1/subjects/${subject.id}`).set(auth.header);
    expect(response.status).toBe(409);
  });

  it('returns an empty list for a student without a class', async () => {
    const auth = await registerUser(app, { email: 'sub-noclass@a.test' });
    const response = await request(app).get('/api/v1/subjects').set(auth.header);
    expect(response.body.items).toEqual([]);
  });
});

describe('dashboard', () => {
  it('builds the five colour-coded cards with status badges', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const subject = await createSubject({ classId: schoolClass.id, teacherId: teacher.id });
    const auth = await registerUser(app, {
      classId: schoolClass.id,
      email: 'dash@a.test',
      fullName: 'Dewi',
    });

    await createDuty({
      classId: schoolClass.id,
      assignedStudentId: auth.user.id,
      createdById: teacher.id,
      date: addDays(todayUtcMidnight(), 1),
    });
    await createHomework({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      dueDate: addDays(new Date(), -1),
    });
    await createExam({
      classId: schoolClass.id,
      subjectId: subject.id,
      createdById: teacher.id,
      examDate: addDays(new Date(), 4),
      publishedAt: new Date(),
    });
    await prisma.uniformItem.createMany({
      data: [{ key: 'kemeja_putih', label: 'Kemeja', category: 'DAILY', isDefault: true }],
    });

    const response = await request(app).get('/api/v1/dashboard').set(auth.header);
    expect(response.status).toBe(200);

    expect(response.body.cards.map((c: { key: string }) => c.key)).toEqual([
      'duty',
      'uniform',
      'homework',
      'exam',
      'subjects',
    ]);
    expect(response.body.palette).toEqual({
      primary: '#2E86C1',
      secondary: '#F39C12',
      accent: '#27AE60',
      danger: '#C0392B',
      neutral: '#7F8C8D',
    });

    const homeworkCard = response.body.cards.find((c: { key: string }) => c.key === 'homework');
    expect(homeworkCard.badge.label).toBe('Terlambat');
    expect(homeworkCard.badge.color).toBe('#C0392B');

    const dutyCard = response.body.cards.find((c: { key: string }) => c.key === 'duty');
    expect(dutyCard.badge.label).toBe('H-1');

    const examCard = response.body.cards.find((c: { key: string }) => c.key === 'exam');
    expect(examCard.badge.label).toBe('H-4');

    expect(response.body.detail.homework.lateCount).toBe(1);
    expect(response.body.user.fullName).toBe('Dewi');
  });

  it('accepts an explicit date and returns a greeting', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'dash-date@a.test' });
    const response = await request(app).get(`/api/v1/dashboard?date=${toDateKey(addDays(new Date(), 2))}`).set(auth.header);
    expect(response.status).toBe(200);
    expect(['Selamat pagi', 'Selamat siang', 'Selamat sore', 'Selamat malam']).toContain(response.body.greeting);
  });

  it('works for a parent whose ward has no class', async () => {
    const parent = await registerUser(app, { role: 'PARENT', email: 'dash-parent@a.test' });
    const ward = await createUser({ role: 'STUDENT' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: ward.id } });

    const response = await request(app).get('/api/v1/dashboard').set(parent.header);
    expect(response.status).toBe(200);
    expect(response.body.cards).toHaveLength(5);
  });
});
