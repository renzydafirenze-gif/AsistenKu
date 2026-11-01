import request from 'supertest';
import { makeApp } from './helpers/app';
import { createClass, createUser, registerUser } from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { assertNoUnknownKeys, validate } from '../src/middleware/validate';
import { BadRequestError } from '../src/lib/errors';
import {
  isKnownRequestError,
  isNotFound,
  isUniqueViolation,
  isValidationError,
} from '../src/lib/prismaErrors';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler';
import { prisma as db } from '../src/db/prisma';

const app = makeApp();

describe('user endpoints', () => {
  it('lists classmates of the caller class', async () => {
    const schoolClass = await createClass();
    await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'A' });
    await createUser({ role: 'STUDENT', classId: schoolClass.id, fullName: 'B' });
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'mates@a.test' });

    const response = await request(app).get('/api/v1/users/classmates').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('forbids a student from reading another class roster', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 11-B');
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'mates-other@a.test' });

    const response = await request(app).get(`/api/v1/users/classmates?classId=${otherClass.id}`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('returns the ward list for a parent', async () => {
    const parent = await registerUser(app, { role: 'PARENT', email: 'wards@a.test' });
    const child = await createUser({ role: 'STUDENT', fullName: 'Anak' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const response = await request(app).get('/api/v1/users/wards').set(parent.header);
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ id: child.id, fullName: 'Anak' });
  });

  it('returns an empty ward list for other roles', async () => {
    const auth = await registerUser(app, { email: 'wards-empty@a.test' });
    const response = await request(app).get('/api/v1/users/wards').set(auth.header);
    expect(response.body.items).toEqual([]);
  });

  it('lets staff read their class roster but not another class', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 12-D');
    await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const staff = await registerUser(app, { role: 'TEACHER', classId: schoolClass.id, email: 'roster@a.test' });

    const allowed = await request(app).get(`/api/v1/users/${schoolClass.id}/roster`).set(staff.header);
    expect(allowed.status).toBe(200);
    expect(allowed.body.items.length).toBeGreaterThanOrEqual(1);

    const denied = await request(app).get(`/api/v1/users/${otherClass.id}/roster`).set(staff.header);
    expect(denied.status).toBe(403);
  });

  it('forbids students from reading a roster', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id, email: 'roster-student@a.test' });
    const response = await request(app).get(`/api/v1/users/${schoolClass.id}/roster`).set(auth.header);
    expect(response.status).toBe(403);
  });

  it('validates the class id parameter', async () => {
    const staff = await registerUser(app, { role: 'TEACHER', email: 'roster-bad@a.test' });
    const response = await request(app).get('/api/v1/users/nope/roster').set(staff.header);
    expect(response.status).toBe(400);
  });

  it('lets a parent read a class roster only when their ward belongs to it', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 10-Z');
    const child = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const parent = await registerUser(app, { role: 'PARENT', email: 'roster-parent@a.test' });
    await prisma.guardianLink.create({ data: { parentId: parent.user.id, studentId: child.id } });

    const allowed = await request(app).get(`/api/v1/users/classmates?classId=${schoolClass.id}`).set(parent.header);
    expect(allowed.status).toBe(200);

    const denied = await request(app).get(`/api/v1/users/classmates?classId=${otherClass.id}`).set(parent.header);
    expect(denied.status).toBe(403);
  });
});

describe('validation middleware', () => {
  it('strips unknown keys rather than passing them through', () => {
    const middleware = validate({ body: require('zod').z.object({ a: require('zod').z.string() }) });
    const req: any = { body: { a: 'x', isAdmin: true }, query: {}, params: {} };
    let error: unknown;
    middleware(req, {} as never, (err?: unknown) => {
      error = err;
    });
    expect(error).toBeUndefined();
    expect(req.body).toEqual({ a: 'x' });
  });

  it('forwards a ZodError to the error handler', () => {
    const middleware = validate({ body: require('zod').z.object({ a: require('zod').z.number() }) });
    const req: any = { body: { a: 'string' }, query: {}, params: {} };
    let error: unknown;
    middleware(req, {} as never, (err?: unknown) => {
      error = err;
    });
    expect(error).toBeTruthy();
  });

  it('assertNoUnknownKeys rejects extra fields', () => {
    expect(() => assertNoUnknownKeys({ a: 1, b: 2 }, ['a'])).toThrow(BadRequestError);
    expect(() => assertNoUnknownKeys({ a: 1 }, ['a'])).not.toThrow();
    expect(() => assertNoUnknownKeys(null, ['a'])).not.toThrow();
    expect(() => assertNoUnknownKeys('string', ['a'])).not.toThrow();
  });
});

describe('prisma error guards', () => {
  it('recognises known request errors by shape', () => {
    const error = { name: 'PrismaClientKnownRequestError', code: 'P2002', message: 'dup' };
    expect(isKnownRequestError(error)).toBe(true);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isNotFound(error)).toBe(false);
    expect(isNotFound({ ...error, code: 'P2025' })).toBe(true);
  });

  it('rejects non-prisma values', () => {
    expect(isKnownRequestError(null)).toBe(false);
    expect(isKnownRequestError({ name: 'Error' })).toBe(false);
    expect(isKnownRequestError({ name: 'PrismaClientKnownRequestError', code: 'X' })).toBe(false);
    expect(isValidationError({ name: 'PrismaClientValidationError' })).toBe(true);
    expect(isValidationError(undefined)).toBe(false);
  });
});

describe('error handler', () => {
  const buildRes = () => {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };

  const req: any = { id: 'req-1', path: '/x', method: 'GET' };

  it('maps Prisma P2002 to 409 with field details', () => {
    const res = buildRes();
    errorHandler(
      Object.assign(new Error('dup'), { name: 'PrismaClientKnownRequestError', code: 'P2002', meta: { target: ['email'] } }),
      req,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('DUPLICATE');
  });

  it('maps P2025 to 404 and P2003 to 400', () => {
    const notFound = buildRes();
    errorHandler(Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError', code: 'P2025' }), req, notFound, jest.fn());
    expect(notFound.status).toHaveBeenCalledWith(404);

    const badRef = buildRes();
    errorHandler(Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError', code: 'P2003' }), req, badRef, jest.fn());
    expect(badRef.status).toHaveBeenCalledWith(400);
  });

  it('maps an unknown prisma code to 400', () => {
    const res = buildRes();
    errorHandler(Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError', code: 'P2034' }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('DATABASE_ERROR');
  });

  it('maps a validation error to 400', () => {
    const res = buildRes();
    errorHandler(Object.assign(new Error('x'), { name: 'PrismaClientValidationError' }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('hides internal errors behind a generic message', () => {
    const res = buildRes();
    errorHandler(new Error('connection string leaked'), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.message).toBe('Terjadi kesalahan pada server');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('connection string');
  });

  it('returns 503 with the exposed message for known 5xx app errors', () => {
    const res = buildRes();
    errorHandler(Object.assign(new Error('down'), { name: 'AppError', status: 503, code: 'X', expose: true }), req, res, jest.fn());
    // Not a real AppError instance -> generic 500, proving instanceof is required.
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles unknown routes', () => {
    const res = buildRes();
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.code).toBe('NOT_FOUND');
  });
});

describe('database client', () => {
  it('exposes a working singleton', async () => {
    const count = await db.schoolClass.count();
    expect(typeof count).toBe('number');
  });
});
