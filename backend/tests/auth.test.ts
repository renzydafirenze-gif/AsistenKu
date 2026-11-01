import request from 'supertest';
import { makeApp } from './helpers/app';
import { createClass, registerUser, TEST_PASSWORD } from './helpers/factories';
import { prisma } from '../src/db/prisma';
import { decryptField, isEncrypted } from '../src/lib/fieldCrypto';
import { UnauthorizedError } from '../src/lib/errors';

const app = makeApp();

describe('POST /api/v1/auth/register', () => {
  it('creates a student and returns an access + refresh token pair', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'Siswa@Sekolah.Test',
      password: TEST_PASSWORD,
      fullName: 'Ani Lestari',
      role: 'STUDENT',
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: 'siswa@sekolah.test',
      fullName: 'Ani Lestari',
      role: 'STUDENT',
    });
    expect(response.body.tokens.tokenType).toBe('Bearer');
    expect(response.body.tokens.accessToken.split('.')).toHaveLength(3);
    expect(response.body.tokens.refreshToken.length).toBeGreaterThan(30);
    // The password hash must never leave the API.
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('stores sensitive fields encrypted at rest', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'pii@sekolah.test',
      password: TEST_PASSWORD,
      fullName: 'Pii User',
      role: 'STUDENT',
      phone: '081234567890',
      address: 'Jl. Merdeka 1',
    });

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'pii@sekolah.test' } });
    expect(stored.phoneEnc).not.toBeNull();
    expect(isEncrypted(stored.phoneEnc!)).toBe(true);
    expect(stored.phoneEnc).not.toContain('081234567890');
    expect(decryptField(stored.phoneEnc!)).toBe('081234567890');
    expect(decryptField(stored.addressEnc!)).toBe('Jl. Merdeka 1');
  });

  it('rejects duplicate emails with 409', async () => {
    await registerUser(app, { email: 'dup@sekolah.test' });
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@sekolah.test', password: TEST_PASSWORD, fullName: 'X', role: 'STUDENT' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects weak passwords with 400 and field details', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'weak@sekolah.test', password: 'abc', fullName: 'X', role: 'STUDENT' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.some((d: { path: string }) => d.path === 'password')).toBe(true);
  });

  it('blocks staff self-registration without the invite code', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'guru@sekolah.test', password: TEST_PASSWORD, fullName: 'Pak Guru', role: 'TEACHER' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('accepts staff registration with a valid invite code', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'guru2@sekolah.test',
      password: TEST_PASSWORD,
      fullName: 'Pak Guru',
      role: 'TEACHER',
      inviteCode: 'test-staff-invite-code-value',
    });
    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('TEACHER');
  });

  it('rejects unknown properties (mass assignment)', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'sneaky@sekolah.test',
      password: TEST_PASSWORD,
      fullName: 'Sneaky',
      role: 'STUDENT',
      isActive: false,
    });
    // Zod strips unknown keys by default; the created user must keep defaults.
    expect(response.status).toBe(201);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'sneaky@sekolah.test' } });
    expect(stored.isActive).toBe(true);
  });

  it('attaches a student to an existing class', async () => {
    const schoolClass = await createClass();
    const auth = await registerUser(app, { classId: schoolClass.id });
    expect(auth.user.classId).toBe(schoolClass.id);
  });

  it('rejects a non-existent class id', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'noclass@sekolah.test',
      password: TEST_PASSWORD,
      fullName: 'No Class',
      role: 'STUDENT',
      classId: '11111111-1111-4111-8111-111111111111',
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    await registerUser(app, { email: 'login@sekolah.test' });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@sekolah.test', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.tokens.accessToken).toBeTruthy();
  });

  it('returns the same 401 for unknown email and wrong password', async () => {
    await registerUser(app, { email: 'known@sekolah.test' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@sekolah.test', password: TEST_PASSWORD });
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'known@sekolah.test', password: 'WrongPass123' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('rejects a deactivated account with 403', async () => {
    await registerUser(app, { email: 'off@sekolah.test' });
    await prisma.user.update({ where: { email: 'off@sekolah.test' }, data: { isActive: false } });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'off@sekolah.test', password: TEST_PASSWORD });
    expect(response.status).toBe(403);
  });

  it('does not allow login for soft-deleted users', async () => {
    await registerUser(app, { email: 'gone@sekolah.test' });
    await prisma.user.update({ where: { email: 'gone@sekolah.test' }, data: { deletedAt: new Date() } });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'gone@sekolah.test', password: TEST_PASSWORD });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and rejects the old one', async () => {
    const auth = await registerUser(app, { email: 'rotate@sekolah.test' });

    const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.tokens.refreshToken).not.toBe(auth.refreshToken);

    // Reusing the rotated token revokes the family (theft detection).
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken });
    expect(reuse.status).toBe(401);

    const afterReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.tokens.refreshToken });
    expect(afterReuse.status).toBe(401);

    const revoked = await prisma.refreshToken.count({
      where: { user: { email: 'rotate@sekolah.test' }, revokedAt: null },
    });
    expect(revoked).toBe(0);
  });

  it('rejects an unknown refresh token', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(48) });
    expect(response.status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    const auth = await registerUser(app, { email: 'expired@sekolah.test' });
    await prisma.refreshToken.updateMany({
      where: { user: { email: 'expired@sekolah.test' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain('kedaluwarsa');
  });
});

describe('authorisation of protected routes', () => {
  it('rejects a request without a token', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('rejects a malformed token', async () => {
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(response.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ role: 'TEACHER', classId: null, type: 'access' }, 'wrong-secret-value-0123456789abcdefgh', {
      algorithm: 'HS256',
      issuer: 'asistensiswa-test',
      audience: 'asistensiswa-test-app',
      subject: 'someone',
    });
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(response.status).toBe(401);
  });

  it('rejects the `alg: none` attack', async () => {
    const jwt = require('jsonwebtoken');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'x', role: 'TEACHER', type: 'access', iss: 'asistensiswa-test', aud: 'asistensiswa-test-app' }),
    ).toString('base64url');
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${header}.${payload}.`);
    expect(response.status).toBe(401);
    expect(jwt).toBeDefined();
  });

  it('returns the current user profile', async () => {
    const auth = await registerUser(app, { email: 'me@sekolah.test', fullName: 'Profil Saya' });
    const response = await request(app).get('/api/v1/auth/me').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.user.fullName).toBe('Profil Saya');
    expect(response.body.user.phone).toBeNull();
  });

  it('invalidates tokens after a role change', async () => {
    const auth = await registerUser(app, { email: 'rolechange@sekolah.test' });
    await prisma.user.update({ where: { id: auth.user.id }, data: { role: 'TEACHER' } });
    const response = await request(app).get('/api/v1/auth/me').set(auth.header);
    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain('Hak akses berubah');
  });
});

describe('password management', () => {
  it('changes the password and revokes refresh tokens', async () => {
    const auth = await registerUser(app, { email: 'change@sekolah.test' });
    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth.header)
      .send({ password: TEST_PASSWORD, newPassword: 'PasswordBaru123' });
    expect(response.status).toBe(204);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'change@sekolah.test', password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'change@sekolah.test', password: 'PasswordBaru123' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const auth = await registerUser(app, { email: 'wrongcurrent@sekolah.test' });
    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth.header)
      .send({ password: 'SalahBanget123', newPassword: 'PasswordBaru123' });
    expect(response.status).toBe(401);
  });

  it('logout-all revokes every session', async () => {
    const auth = await registerUser(app, { email: 'logoutall@sekolah.test' });
    const response = await request(app).post('/api/v1/auth/logout-all').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.revoked).toBeGreaterThanOrEqual(1);

    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('logout revokes a single refresh token', async () => {
    const auth = await registerUser(app, { email: 'logout@sekolah.test' });
    const response = await request(app).post('/api/v1/auth/logout').send({ refreshToken: auth.refreshToken });
    expect(response.status).toBe(204);
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('push token registration', () => {
  it('registers a device token and dedupes repeats', async () => {
    const auth = await registerUser(app, { email: 'push@sekolah.test' });
    const payload = { token: 'fcm-token-abcdefghijklmnop', platform: 'FCM' };

    const first = await request(app).post('/api/v1/auth/push-tokens').set(auth.header).send(payload);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v1/auth/push-tokens').set(auth.header).send(payload);
    expect(second.status).toBe(201);

    const stored = await prisma.pushToken.findMany({ where: { userId: auth.user.id } });
    expect(stored).toHaveLength(1);
  });

  it('transfers a token that was registered by another account', async () => {
    const first = await registerUser(app, { email: 'device1@sekolah.test' });
    const second = await registerUser(app, { email: 'device2@sekolah.test' });
    const payload = { token: 'shared-device-token-123456', platform: 'APNS' as const };

    await request(app).post('/api/v1/auth/push-tokens').set(first.header).send(payload);
    await request(app).post('/api/v1/auth/push-tokens').set(second.header).send(payload);

    const tokens = await prisma.pushToken.findMany({ where: { token: payload.token } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.userId).toBe(second.user.id);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'push_token.transfer' } });
    expect(audit).not.toBeNull();
  });

  it('revokes a token', async () => {
    const auth = await registerUser(app, { email: 'revoke@sekolah.test' });
    const payload = { token: 'revoke-me-token-1234567890', platform: 'FCM' as const };
    await request(app).post('/api/v1/auth/push-tokens').set(auth.header).send(payload);

    const response = await request(app).delete('/api/v1/auth/push-tokens').set(auth.header).send(payload);
    expect(response.status).toBe(204);

    const stored = await prisma.pushToken.findFirstOrThrow({ where: { token: payload.token } });
    expect(stored.revokedAt).not.toBeNull();
  });

  it('lists active tokens only', async () => {
    const auth = await registerUser(app, { email: 'listtokens@sekolah.test' });
    await request(app)
      .post('/api/v1/auth/push-tokens')
      .set(auth.header)
      .send({ token: 'active-token-1234567890', platform: 'FCM' });

    const response = await request(app).get('/api/v1/auth/push-tokens').set(auth.header);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('validates the platform value', async () => {
    const auth = await registerUser(app, { email: 'badplatform@sekolah.test' });
    const response = await request(app)
      .post('/api/v1/auth/push-tokens')
      .set(auth.header)
      .send({ token: 'some-token-1234567890', platform: 'WEBPUSH' });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/google', () => {
  it('signs in with a verified Google identity and creates the account', async () => {
    const googleApp = makeApp({
      googleVerifier: {
        verify: async (idToken: string) => {
          expect(idToken).toBe('valid-google-id-token');
          return { sub: 'google-sub-1', email: 'google@sekolah.test', emailVerified: true, name: 'Google User' };
        },
      },
    });

    const response = await request(googleApp)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-google-id-token', role: 'STUDENT' });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('google@sekolah.test');
    expect(response.body.user.fullName).toBe('Google User');

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'google@sekolah.test' } });
    expect(stored.googleId).toBe('google-sub-1');
    expect(stored.passwordHash).toBeNull();
  });

  it('links an existing password account to Google on first sign-in', async () => {
    await registerUser(app, { email: 'link@sekolah.test' });
    const googleApp = makeApp({
      googleVerifier: {
        verify: async () => ({ sub: 'google-sub-2', email: 'link@sekolah.test', emailVerified: true }),
      },
    });

    const response = await request(googleApp).post('/api/v1/auth/google').send({ idToken: 'x'.repeat(64) });
    expect(response.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'link@sekolah.test' } });
    expect(stored.googleId).toBe('google-sub-2');
  });

  it('rejects an unverified Google email', async () => {
    const googleApp = makeApp({
      googleVerifier: {
        verify: async () => ({ sub: 'google-sub-3', email: 'unverified@sekolah.test', emailVerified: false }),
      },
    });
    const response = await request(googleApp).post('/api/v1/auth/google').send({ idToken: 'y'.repeat(64) });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid Google token', async () => {
    const googleApp = makeApp({
      googleVerifier: {
        verify: async () => {
          throw new UnauthorizedError('Token Google tidak valid');
        },
      },
    });
    const response = await request(googleApp).post('/api/v1/auth/google').send({ idToken: 'z'.repeat(64) });
    expect(response.status).toBe(401);
  });
});
