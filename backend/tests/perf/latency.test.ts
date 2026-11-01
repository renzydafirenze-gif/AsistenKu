import request from 'supertest';
import { makeApp, bearer } from '../helpers/app';
import { createClass, createDuty, createUser, registerUser } from '../helpers/factories';

/**
 * Latency guard for the DoD target "duty fetch under 200 ms".
 * Runs against SQLite, so it measures application overhead (auth, validation,
 * serialisation), not Postgres round-trip time. Real query plans are covered by
 * the k6 scenario in `perf/k6/duty.js` against a deployed stack.
 */
const app = makeApp();
const SAMPLES = 25;
const BUDGET_MS = 200;

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

describe('duty latency budget', () => {
  it(`serves GET /api/v1/duties within ${BUDGET_MS}ms p95`, async () => {
    const schoolClass = await createClass('Kelas 10-Perf');
    const student = await createUser({
      role: 'STUDENT',
      classId: schoolClass.id,
      fullName: 'Perf Student',
    });
    const teacher = await createUser({ role: 'TEACHER', classId: schoolClass.id });
    for (let i = 0; i < 20; i += 1) {
      await createDuty({
        classId: schoolClass.id,
        assignedStudentId: student.id,
        createdById: teacher.id,
      });
    }
    const auth = await registerUser(app, {
      role: 'STUDENT',
      classId: schoolClass.id,
      email: 'perf.student@a.test',
    });

    // Warm-up: first call pays lazy module/crypto init.
    await request(app).get('/api/v1/duties').set(bearer(auth.accessToken));

    const durations: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const started = process.hrtime.bigint();
      const response = await request(app).get('/api/v1/duties').set(bearer(auth.accessToken));
      durations.push(Number(process.hrtime.bigint() - started) / 1e6);
      expect(response.status).toBe(200);
    }

    const measured = p95(durations);
    expect(measured).toBeLessThan(BUDGET_MS);
  });
});
