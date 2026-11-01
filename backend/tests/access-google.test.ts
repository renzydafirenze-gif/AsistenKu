import request from 'supertest';
import { makeApp } from './helpers/app';
import { createClass, createUser, registerUser } from './helpers/factories';
import { prisma } from '../src/db/prisma';
import {
  assertCanManageClass,
  assertCanViewStudent,
  logDeniedAttempt,
  visibleStudentIds,
} from '../src/modules/users/access';
import { ForbiddenError, NotFoundError } from '../src/lib/errors';
import type { AuthUser } from '../src/types/express';

const app = makeApp();

function principal(overrides: Partial<AuthUser> & { id: string; role: AuthUser['role'] }): AuthUser {
  return {
    email: 'x@y.test',
    fullName: 'X',
    classId: null,
    ...overrides,
  };
}

describe('student data access rules', () => {
  it('lets students see themselves', async () => {
    const student = await createUser({ role: 'STUDENT' });
    await expect(
      assertCanViewStudent(principal({ id: student.id, role: 'STUDENT' }), student.id),
    ).resolves.toBeUndefined();
  });

  it('refuses students seeing classmates', async () => {
    const a = await createUser({ role: 'STUDENT' });
    const b = await createUser({ role: 'STUDENT' });
    await expect(assertCanViewStudent(principal({ id: a.id, role: 'STUDENT' }), b.id)).rejects.toThrow(ForbiddenError);
  });

  it('lets a parent see a linked child only', async () => {
    const parent = await createUser({ role: 'PARENT' });
    const child = await createUser({ role: 'STUDENT' });
    const stranger = await createUser({ role: 'STUDENT' });
    await prisma.guardianLink.create({ data: { parentId: parent.id, studentId: child.id } });

    const actor = principal({ id: parent.id, role: 'PARENT' });
    await expect(assertCanViewStudent(actor, child.id)).resolves.toBeUndefined();
    await expect(assertCanViewStudent(actor, stranger.id)).rejects.toThrow(ForbiddenError);
  });

  it('lets teachers see students in their own class only', async () => {
    const schoolClass = await createClass();
    const otherClass = await createClass('Kelas 11-X');
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const own = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const foreign = await createUser({ role: 'STUDENT', classId: otherClass.id });
    const actor = principal({ id: teacher.id, role: 'TEACHER', classId: schoolClass.id });

    await expect(assertCanViewStudent(actor, own.id)).resolves.toBeUndefined();
    await expect(assertCanViewStudent(actor, foreign.id)).rejects.toThrow(ForbiddenError);
  });

  it('rejects a missing student and non-student targets', async () => {
    const teacher = await createUser({ role: 'TEACHER' });
    const otherTeacher = await createUser({ role: 'TEACHER' });
    const actor = principal({ id: teacher.id, role: 'TEACHER' });

    await expect(
      assertCanViewStudent(actor, '55555555-5555-4555-8555-555555555555'),
    ).rejects.toThrow(NotFoundError);
    await expect(assertCanViewStudent(actor, otherTeacher.id)).rejects.toThrow(ForbiddenError);
  });

  it('allows staff without a class to read any student', async () => {
    const teacher = await createUser({ role: 'TEACHER' });
    const student = await createUser({ role: 'STUDENT' });
    await expect(
      assertCanViewStudent(principal({ id: teacher.id, role: 'TEACHER', classId: null }), student.id),
    ).resolves.toBeUndefined();
  });

  it('only staff can manage a class', async () => {
    const student = await createUser({ role: 'STUDENT' });
    await expect(
      assertCanManageClass(principal({ id: student.id, role: 'STUDENT' }), null),
    ).rejects.toThrow(ForbiddenError);

    const scoped = principal({ id: 't1', role: 'TEACHER', classId: '11111111-1111-4111-8111-111111111111' });
    await expect(
      assertCanManageClass(scoped, '22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      assertCanManageClass(scoped, '11111111-1111-4111-8111-111111111111'),
    ).resolves.toBeUndefined();

    // Unscoped staff may manage any class.
    const unscoped = principal({ id: 't2', role: 'TEACHER', classId: null });
    await expect(assertCanManageClass(unscoped, '33333333-3333-4333-8333-333333333333')).resolves.toBeUndefined();
  });

  it('scopes visible students by role', async () => {
    const schoolClass = await createClass();
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    const student = await createUser({ role: 'STUDENT', classId: schoolClass.id });
    const otherClass = await createClass('Kelas 12-Y');
    const otherStudent = await createUser({ role: 'STUDENT', classId: otherClass.id });

    expect(await visibleStudentIds(principal({ id: student.id, role: 'STUDENT' }))).toEqual([student.id]);

    const staffIds = await visibleStudentIds(principal({ id: teacher.id, role: 'TEACHER', classId: schoolClass.id }));
    expect(staffIds).toContain(student.id);
    expect(staffIds).not.toContain(otherStudent.id);

    const parent = await createUser({ role: 'PARENT' });
    await prisma.guardianLink.create({ data: { parentId: parent.id, studentId: student.id } });
    expect(await visibleStudentIds(principal({ id: parent.id, role: 'PARENT' }))).toEqual([student.id]);
  });

  it('writes an audit entry for denied attempts', async () => {
    await logDeniedAttempt(undefined, 'test.denied', 'Unit', 'id-1', { reason: 'test' });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'test.denied' } });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.metadata).reason).toBe('test');
  });
});

describe('google identity mapping', () => {
  const kid = 'test-kid';

  beforeEach(() => {
    jest.resetModules();
  });

  it('maps a verified Google payload to an identity', async () => {
    jest.doMock('jose', () => ({
      createRemoteJWKSet: jest.fn(() => 'jwks'),
      jwtVerify: jest.fn(async () => ({
        payload: { sub: 'g-1', email: 'Google@Sekolah.Test', email_verified: true, name: 'G', picture: 'https://p/x.png' },
      })),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JoseGoogleVerifier } = require('../src/modules/auth/google');
    const verifier = new JoseGoogleVerifier(['client-id']);
    const identity = await verifier.verify('token');
    expect(identity).toEqual({
      sub: 'g-1',
      email: 'google@sekolah.test',
      emailVerified: true,
      name: 'G',
      picture: 'https://p/x.png',
    });
    void kid;
  });

  it('accepts the string form of email_verified', async () => {
    jest.doMock('jose', () => ({
      createRemoteJWKSet: jest.fn(() => 'jwks'),
      jwtVerify: jest.fn(async () => ({ payload: { sub: 'g-2', email: 'a@b.test', email_verified: 'true' } })),
    }));
    const { JoseGoogleVerifier } = require('../src/modules/auth/google');
    const identity = await new JoseGoogleVerifier(['client-id']).verify('token');
    expect(identity.emailVerified).toBe(true);
  });

  it('rejects a payload without an identity', async () => {
    jest.doMock('jose', () => ({
      createRemoteJWKSet: jest.fn(() => 'jwks'),
      jwtVerify: jest.fn(async () => ({ payload: { email: 'a@b.test' } })),
    }));
    const { JoseGoogleVerifier } = require('../src/modules/auth/google');
    await expect(new JoseGoogleVerifier(['client-id']).verify('token')).rejects.toThrow('Token Google tidak memuat identitas');
  });

  it('rejects when jose verification fails', async () => {
    jest.doMock('jose', () => ({
      createRemoteJWKSet: jest.fn(() => 'jwks'),
      jwtVerify: jest.fn(async () => {
        throw new Error('signature invalid');
      }),
    }));
    const { JoseGoogleVerifier } = require('../src/modules/auth/google');
    await expect(new JoseGoogleVerifier(['client-id']).verify('token')).rejects.toThrow('Token Google tidak valid');
  });

  it('serves the cached default verifier', async () => {
    const { defaultGoogleVerifier } = require('../src/modules/auth/google');
    expect(defaultGoogleVerifier()).toBe(defaultGoogleVerifier());
  });

  it('builds the boot-safe verifier without touching configuration', () => {
    // Constructing the eager verifier throws when no client id is configured;
    // the lazy wrapper must not, so the API can boot without Google sign-in.
    const { lazyGoogleVerifier } = require('../src/modules/auth/google');
    expect(() => lazyGoogleVerifier()).not.toThrow();
    expect(typeof lazyGoogleVerifier().verify).toBe('function');
  });
});
