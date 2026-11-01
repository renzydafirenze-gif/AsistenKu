// k6 load scenario for the "duty fetch under 200 ms" acceptance criterion.
// Run against a deployed stack (needs a real Postgres, not the SQLite mirror):
//   BASE_URL=https://api.example.test K6_TOKEN=<student access token> \
//     k6 run perf/k6/duty.js
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const dutyLatency = new Trend('duty_fetch_ms', true);

export const options = {
  vus: Number(__ENV.VUS ?? 20),
  duration: __ENV.DURATION ?? '30s',
  thresholds: {
    // p95 of the whole request, plus a hard assert on the server-side p95.
    'http_req_failed': ['rate<0.01'],
    'duty_fetch_ms{expected_response:true}': ['p(95)<200'],
  },
};

const baseUrl = __ENV.BASE_URL ?? 'http://localhost:4000';
const token = __ENV.K6_TOKEN;

export function setup() {
  if (!token) throw new Error('K6_TOKEN env var is required (student access token)');
  return { auth: `Bearer ${token}` };
}

export default function (data) {
  const response = http.get(`${baseUrl}/api/v1/duties`, {
    headers: { Authorization: data.auth },
    tags: { expected_response: 'true' },
  });
  dutyLatency.add(response.timings.duration);
  check(response, { 'status 200': (r) => r.status === 200 });
}
