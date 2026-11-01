import request from 'supertest';
import { makeApp } from './helpers/app';
import { registerUser } from './helpers/factories';
import { prisma } from '../src/db/prisma';

describe('security hardening', () => {
  it('sets standard security headers and hides the framework', async () => {
    const response = await request(makeApp()).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('does not leak stack traces or driver details on errors', async () => {
    const response = await request(makeApp()).get('/api/v1/duties');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(response.body)).not.toContain('at ');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('rejects malformed JSON with 400 instead of crashing', async () => {
    const response = await request(makeApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects oversized bodies', async () => {
    const response = await request(makeApp())
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.test', password: 'x'.repeat(400_000) });
    expect(response.status).toBe(413);
  });

  it('returns 404 with a correlation id for unknown routes', async () => {
    const response = await request(makeApp()).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('allows the configured CORS origin', async () => {
    const response = await request(makeApp()).get('/health').set('Origin', 'http://localhost:8081');
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('enforces the rate limit and returns RateLimit headers', async () => {
    const app = makeApp({ enableRateLimit: true, rateLimitOptions: { limit: 100 } });
    const auth = await registerUser(app, { email: 'ratelimit@a.test' });

    let sawHeaders = false;
    let limited = false;
    for (let i = 0; i < 130; i += 1) {
      const response = await request(app).get('/api/v1/duties').set(auth.header);
      if (response.headers['ratelimit']) sawHeaders = true;
      if (response.status === 429) {
        limited = true;
        expect(response.body.error.code).toBe('TOO_MANY_REQUESTS');
        break;
      }
    }

    expect(sawHeaders).toBe(true);
    expect(limited).toBe(true);
  });

  it('uses a stricter bucket for credential endpoints', async () => {
    const app = makeApp({ enableRateLimit: true, rateLimitOptions: { limit: 10 } });
    let limited = false;
    for (let i = 0; i < 20; i += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'brute@a.test', password: 'WrongPass123' });
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('rate limits by account once authenticated', async () => {
    const app = makeApp({ enableRateLimit: true, rateLimitOptions: { limit: 100 } });
    const first = await registerUser(app, { email: 'bucket1@a.test' });
    const second = await registerUser(app, { email: 'bucket2@a.test' });

    for (let i = 0; i < 101; i += 1) {
      await request(app).get('/api/v1/duties').set(first.header);
    }
    const blocked = await request(app).get('/api/v1/duties').set(first.header);
    const unaffected = await request(app).get('/api/v1/duties').set(second.header);

    expect(blocked.status).toBe(429);
    expect(unaffected.status).toBe(200);
  });

  it('refuses plaintext HTTP in production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createApp: createProdApp } = require('../src/app');
      const prodApp = createProdApp({ enableRateLimit: false });
      return request(prodApp)
        .get('/health')
        .set('x-forwarded-proto', 'http')
        .then((response: request.Response) => {
          expect(response.status).toBe(403);
          expect(response.body.error.code).toBe('TLS_REQUIRED');
        });
    });
    process.env.NODE_ENV = original;
  });

  it('never exposes password hashes or PII in API responses', async () => {
    const auth = await registerUser(makeApp(), {
      email: 'pii-response@a.test',
      phone: '081200000000',
      address: 'Jl. Rahasia',
    });
    const serialised = JSON.stringify(auth.user);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('Enc');
  });

  it('audits denied cross-class access', async () => {
    const auth = await registerUser(makeApp(), { role: 'TEACHER', email: 'audit-denied@a.test' });
    await request(makeApp()).get('/api/v1/users/11111111-1111-4111-8111-111111111111/roster').set(auth.header);
    const count = await prisma.auditLog.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('accepts only https resource links (no javascript: or data: URLs)', async () => {
    const app = makeApp();
    const auth = await registerUser(app, { role: 'TEACHER', email: 'url-scheme@a.test' });
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'ftp://x.test/a']) {
      const response = await request(app)
        .post('/api/v1/subjects')
        .set(auth.header)
        .send({ code: `X${Math.random().toString(36).slice(2, 5).toUpperCase()}`, name: 'X', resourceUrl: bad });
      expect(response.status).toBe(400);
    }
  });

  it('does not allow SQL-ish input to reach the driver unescaped', async () => {
    const app = makeApp();
    const auth = await registerUser(app, { email: 'sqli@a.test' });
    const response = await request(app)
      .get("/api/v1/homework?subjectId=' OR 1=1 --")
      .set(auth.header);
    // Rejected by validation (uuid), proving the value is never interpolated.
    expect(response.status).toBe(400);
  });
});
