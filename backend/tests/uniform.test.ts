import request from 'supertest';
import { makeApp } from './helpers/app';
import {
  addDays,
  createCalendarDay,
  createClass,
  createUniformCatalog,
  createUser,
  registerUser,
  todayUtcMidnight,
} from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { toDateKey } from '../src/lib/dates';

const app = makeApp();
const TODAY = toDateKey(todayUtcMidnight());
const TOMORROW = toDateKey(addDays(todayUtcMidnight(), 1));

describe('uniform checklist', () => {
  beforeEach(async () => {
    await createUniformCatalog();
  });

  it('falls back to default items when no calendar row exists', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-default@a.test' });

    const response = await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.checklist.dayType).toBe('SCHOOL_DAY');
    expect(response.body.checklist.items.map((i: { key: string }) => i.key).sort()).toEqual(
      ['celana_navy', 'dasi', 'kemeja_putih'].sort(),
    );
    expect(response.body.checklist.status).toBe('PENDING');
    expect(response.body.checklist.badge.color).toBe('#2E86C1');
  });

  it('only shows items permitted by the academic calendar for that day', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-permitted@a.test' });
    await createCalendarDay(todayUtcMidnight(), 'EVENT', ['kemeja_putih', 'seragam_olahraga']);

    const response = await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    expect(response.body.checklist.dayType).toBe('EVENT');
    expect(response.body.checklist.items).toHaveLength(2);
    expect(response.body.checklist.items.map((i: { key: string }) => i.key).sort()).toEqual(
      ['kemeja_putih', 'seragam_olahraga'].sort(),
    );
  });

  it('returns an empty holiday checklist', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-holiday@a.test' });
    await createCalendarDay(todayUtcMidnight(), 'HOLIDAY', []);

    const response = await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    expect(response.body.checklist.status).toBe('HOLIDAY');
    expect(response.body.checklist.items).toEqual([]);
    expect(response.body.checklist.badge.color).toBe('#7F8C8D');
  });

  it('toggles an item and updates the completion badge', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-toggle@a.test' });

    const first = await request(app)
      .patch('/api/v1/uniform/checklist')
      .set(auth.header)
      .send({ date: TODAY, itemKey: 'kemeja_putih', checked: true });

    expect(first.status).toBe(200);
    expect(first.body.checklist.completedCount).toBe(1);
    expect(first.body.checklist.status).toBe('PARTIAL');
    expect(first.body.checklist.badge.color).toBe('#F39C12');

    for (const key of ['celana_navy', 'dasi']) {
      await request(app).patch('/api/v1/uniform/checklist').set(auth.header).send({ date: TODAY, itemKey: key, checked: true });
    }

    const done = await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    expect(done.body.checklist.status).toBe('COMPLETE');
    expect(done.body.checklist.completedCount).toBe(3);
    expect(done.body.checklist.badge.color).toBe('#27AE60');
  });

  it('unchecks an item again', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-untoggle@a.test' });
    await request(app).patch('/api/v1/uniform/checklist').set(auth.header).send({ date: TODAY, itemKey: 'dasi', checked: true });
    const response = await request(app)
      .patch('/api/v1/uniform/checklist')
      .set(auth.header)
      .send({ date: TODAY, itemKey: 'dasi', checked: false });

    expect(response.status).toBe(200);
    expect(response.body.checklist.completedCount).toBe(0);
    const item = await prisma.uniformChecklistItem.findFirstOrThrow({ where: { itemKey: 'dasi' } });
    expect(item.checkedAt).toBeNull();
  });

  it('rejects an item not permitted by the calendar (409)', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-forbidden-item@a.test' });
    await createCalendarDay(todayUtcMidnight(), 'SCHOOL_DAY', ['kemeja_putih']);

    const response = await request(app)
      .patch('/api/v1/uniform/checklist')
      .set(auth.header)
      .send({ date: TODAY, itemKey: 'seragam_olahraga', checked: true });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('tidak diizinkan');
  });

  it('rejects toggling on a holiday', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-holiday-toggle@a.test' });
    await createCalendarDay(todayUtcMidnight(), 'HOLIDAY', []);

    const response = await request(app)
      .patch('/api/v1/uniform/checklist')
      .set(auth.header)
      .send({ date: TODAY, itemKey: 'dasi', checked: true });
    expect(response.status).toBe(409);
  });

  it('reconciles stored items when the calendar changes', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'u-reconcile@a.test' });
    await request(app).patch('/api/v1/uniform/checklist').set(auth.header).send({ date: TODAY, itemKey: 'dasi', checked: true });

    await createCalendarDay(todayUtcMidnight(), 'SCHOOL_DAY', ['kemeja_putih']);
    const response = await request(app).get('/api/v1/uniform/checklist').set(auth.header);

    expect(response.body.checklist.items).toHaveLength(1);
    expect(response.body.checklist.items[0].key).toBe('kemeja_putih');
    expect(response.body.checklist.items[0].checked).toBe(false);
    const stale = await prisma.uniformChecklistItem.findFirst({ where: { itemKey: 'dasi' } });
    expect(stale).toBeNull();
  });

  it('forbids teachers from toggling a student checklist', async () => {
    const schoolClass = await createClass();
    const teacher = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'u-teacher-toggle@a.test' });
    const response = await request(app)
      .patch('/api/v1/uniform/checklist')
      .set(teacher.header)
      .send({ date: TODAY, itemKey: 'dasi', checked: true });
    expect(response.status).toBe(403);
  });

  it('lets a parent read their ward checklist but not another student', async () => {
    const schoolClass = await createClass();
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const stranger = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const parent = await registerUser(app, { role: 'PARENT', email: 'u-parent@a.test' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const allowed = await request(app).get(`/api/v1/uniform/checklist?studentId=${child.id}`).set(parent.header);
    expect(allowed.status).toBe(200);

    const denied = await request(app).get(`/api/v1/uniform/checklist?studentId=${stranger.id}`).set(parent.header);
    expect(denied.status).toBe(403);
  });

  it('requires studentId for non-student callers', async () => {
    const auth = await registerUser(app, { role: 'TEACHER', email: 'u-needsid@a.test' });
    const response = await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    expect(response.status).toBe(400);
  });

  it('exposes the permitted items endpoint', async () => {
    const auth = await registerUser(app, { email: 'u-permitted-endpoint@a.test' });
    await createCalendarDay(addDays(todayUtcMidnight(), 3), 'EXAM_DAY', ['kemeja_putih', 'dasi']);

    const response = await request(app)
      .get(`/api/v1/uniform/permitted?date=${toDateKey(addDays(todayUtcMidnight(), 3))}`)
      .set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.dayType).toBe('EXAM_DAY');
    expect(response.body.keys.sort()).toEqual(['dasi', 'kemeja_putih'].sort());
  });

  it('lets staff manage the academic calendar', async () => {
    const schoolClass = await createClass();
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'u-cal-staff@a.test' });

    const created = await request(app)
      .put('/api/v1/uniform/calendar')
      .set(staff.header)
      .send({ date: TOMORROW, dayType: 'EVENT', uniformItems: ['kemeja_putih'], note: 'Peringatan' });
    expect(created.status).toBe(200);

    const range = await request(app).get(`/api/v1/uniform/calendar?from=${TODAY}&to=${TOMORROW}`).set(staff.header);
    expect(range.status).toBe(200);
    expect(range.body.items).toHaveLength(1);
    expect(range.body.items[0]).toMatchObject({ date: TOMORROW, dayType: 'EVENT' });
  });

  it('rejects unknown uniform keys in the calendar', async () => {
    const schoolClass = await createClass();
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'u-cal-bad@a.test' });
    const response = await request(app)
      .put('/api/v1/uniform/calendar')
      .set(staff.header)
      .send({ date: TOMORROW, dayType: 'EVENT', uniformItems: ['tidak_ada'] });
    expect(response.status).toBe(409);
  });

  it('forbids students from editing the calendar', async () => {
    const auth = await registerUser(app, { email: 'u-cal-student@a.test' });
    const response = await request(app)
      .put('/api/v1/uniform/calendar')
      .set(auth.header)
      .send({ date: TOMORROW, dayType: 'HOLIDAY', uniformItems: [] });
    expect(response.status).toBe(403);
  });

  it('lists the uniform catalog and lets staff add items', async () => {
    const staff = await registerUser(app, { role: 'TEACHER', email: 'u-items@a.test' });
    const list = await request(app).get('/api/v1/uniform/items').set(staff.header);
    expect(list.body.items).toHaveLength(4);

    const created = await request(app)
      .post('/api/v1/uniform/items')
      .set(staff.header)
      .send({ key: 'jas_lab', label: 'Jas Laboratorium', category: 'SPECIAL' });
    expect(created.status).toBe(201);
    expect(created.body.item.key).toBe('jas_lab');
  });

  it('validates the item key format', async () => {
    const staff = await registerUser(app, { role: 'TEACHER', email: 'u-items-bad@a.test' });
    const response = await request(app)
      .post('/api/v1/uniform/items')
      .set(staff.header)
      .send({ key: 'Jas Lab!', label: 'X', category: 'SPECIAL' });
    expect(response.status).toBe(400);
  });

  it('is idempotent: reading twice does not duplicate checklist rows', async () => {
    const auth = await registerUser(app, { email: 'u-idem@a.test' });
    await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    await request(app).get('/api/v1/uniform/checklist').set(auth.header);
    expect(await prisma.uniformChecklist.count()).toBe(1);
    expect(await prisma.uniformChecklistItem.count()).toBe(3);
  });

  it('rejects an invalid date', async () => {
    const auth = await registerUser(app, { email: 'u-baddate@a.test' });
    const response = await request(app).get('/api/v1/uniform/checklist?date=2026-02-31').set(auth.header);
    expect(response.status).toBe(400);
  });
});
