# AsistenSiswa — Backend

REST API for the AsistenSiswa high-school assistant: daily duty roster, uniform
checklist, homework, exams, subjects, dashboard and push reminders.

Stack: Node 18.18+, TypeScript (strict), Express 4, Prisma 6, PostgreSQL 15,
JWT (HS256) + RBAC, Zod validation, Pino logging, Jest + Supertest.

## Quick start

```bash
cp .env.example .env          # fill JWT_SECRET and FIELD_ENCRYPTION_KEY
npm ci
npm run prisma:generate
npm run prisma:migrate        # or: npx prisma migrate deploy
npm run dev                   # http://localhost:4000
```

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # FIELD_ENCRYPTION_KEY
```

`npm run dev` still fails fast if any required variable is missing — see
`src/config/env.ts` for the schema and defaults. Blank optional values
(`STAFF_INVITE_CODE=`, `INTERNAL_JOB_SECRET=`) are treated as unset.

### Demo without PostgreSQL

For UI review or a classroom demo, the API can run on SQLite using the same
Prisma models (the client is the one generated for tests):

```bash
npm run demo        # creates prisma/demo.db, seeds it, starts on :4000
```

Seeded accounts (password `Rahasia123`): `ani@sekolah.test`,
`beni@sekolah.test`, `sari@sekolah.test` (teacher). `npm run demo:db` and
`npm run demo:seed` run the two steps separately. Demo-only: the seed deletes
every row, and `DATABASE_PROVIDER=sqlite` must never be used in production.

### With Docker

```bash
cd .. && JWT_SECRET=... FIELD_ENCRYPTION_KEY=... docker compose up --build
```

The Docker entrypoint applies `prisma migrate deploy` before starting; set
`RUN_MIGRATIONS=false` when a separate migration job owns the schema.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | tsx watch server |
| `npm run build` / `npm start` | compile to `dist/`, run it |
| `npm run lint` | ESLint (`src`, `tests`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | full Jest suite (SQLite mirror) |
| `npm run test:coverage` | same + coverage gate |
| `npm run openapi:lint` | structural lint of `openapi.yaml` |
| `npm run bench:smoke` | duty-fetch latency guard (< 200 ms p95) |
| `npm run prisma:migrate` | create/apply a dev migration |
| `npm run demo` | SQLite demo: migrate + seed + serve |

## Architecture

```
src/
├─ app.ts              # createApp(deps): middleware stack + routers
├─ server.ts           # process bootstrap, graceful shutdown
├─ config/             # env schema, typed config
├─ db/                 # PrismaClient singleton
├─ domain/             # RBAC policy, shared domain types
├─ lib/                # jwt, password, fieldCrypto, dates, hlc, audit, errors
├─ middleware/         # auth, validate, requestContext, rateLimit, errorHandler
└─ modules/<feature>/  # routes → schemas → service (controllers are thin)
```

Each feature module owns its router, Zod schemas and service. Services take the
authenticated actor (`req.user`) as the first argument and enforce ownership and
class scope themselves, so rules hold regardless of the HTTP layer.

`createApp` accepts injected dependencies (`clock`, `notificationService`,
`googleVerifier`, `enableRateLimit`, `rateLimitOptions`) — tests use this to
freeze time, stub push delivery and disable rate limiting.

### Test database

Production targets PostgreSQL (`prisma/schema.prisma`). Running Postgres in CI
or on a laptop is not always available, so `scripts/gen-test-schema.cjs`
derives `prisma/schema.test.prisma` (same models, SQLite provider) and
`npm test` generates a separate client into `generated/test-client`. Never edit
the generated schema; edit `schema.prisma`.

Because Prisma generates two distinct classes, error mapping in
`src/lib/prismaErrors.ts` is duck-typed (`code === 'P2002'`) instead of
`instanceof`.

## Business rules and where they live

| Rule | Implementation |
| --- | --- |
| H-1 duty reminder goes only to the assigned student | `modules/notifications` — recipients derived from `DutySchedule.assignedStudentId`, `NOTIFICATION_LEAD_HOURS` (default 24) |
| Exam schedule immutable after publication | `modules/exam/exam.service.ts` — 403 + `AuditLog` entry on mutation of a published exam |
| Uniform checklist must match the academic calendar | `modules/uniform` — catalog items validated against `CalendarDay` for the target date |
| Late homework is red-flagged and cannot be deleted | `modules/homework` — `isLate` computed from deadline + status; delete returns 403 when late |
| Critical changes are audited | `lib/audit.ts` writes append-only `AuditLog` rows (DELETE blocked by a DB trigger) |
| Students only see their own/class-scoped data | `domain/policy.ts` helpers used by every service |

Staff with `classId = null` are unscoped (may act on any class); staff bound to a
class are confined to it. Students and parents always resolve to their own class.

## Security

- JWT HS256 pinned (`algorithms: ['HS256']`), issuer/audience checked, 15 min
  access token + rotating refresh tokens.
- `bcryptjs` with cost 12 (validated 4–15).
- PII (phone, address) encrypted at rest with AES-256-GCM in the app layer
  (`lib/fieldCrypto.ts`); `pgcrypto` is also enabled in the hardening migration.
- Helmet, CORS allow-list, 100 req/min rate limit keyed by JWT `sub` (falling
  back to IP), tighter bucket on `/api/v1/auth/*`, 100 kB body cap.
- `NODE_ENV=production` requires TLS at the proxy (`X-Forwarded-Proto`) and
  enables HSTS.
- All request bodies/queries/params are Zod-validated; errors never leak stack
  traces or SQL.
- Push providers dry-run unless `PUSH_DRY_RUN=false` **and** credentials exist.

## Database migrations

```
prisma/migrations/
├─ 20260101000000_init/       # baseline DDL for the 18-model schema
├─ 20260101000100_hardening/  # pgcrypto, CHECK constraints, partial indexes,
│                             # append-only AuditLog trigger
└─ migration_lock.toml
```

`npx prisma migrate deploy` applies them in order. The SQL was produced with
`prisma migrate diff` and reviewed by hand; the hardening migration adds
invariants Prisma cannot express (enum-like CHECKs, uniqueness on partial
indexes, immutability of audit rows).

## API contract

`openapi.yaml` is the source of truth for the mobile client: 37 paths,
53 operations, 30 schemas. Lint it with `npm run openapi:lint`; the checker
fails on dangling `$ref`s, duplicate operation ids, undeclared path parameters,
missing `responses` and schemas without a type.

Health probes: `GET /health` (liveness) and `GET /health/ready` (readiness).

## Testing

```bash
npm test                 # 353 tests, 17 suites
npm run test:coverage    # gate: branches 83, functions 95, lines 95, statements 95
npm run bench:smoke      # duty fetch p95 < 200 ms
```

Integration tests boot the real Express app through Supertest against the SQLite
mirror; `tests/setup-db.ts` truncates tables before each test, so suites are
order-independent. Unit tests cover crypto, dates, HLC, policy and providers.

For load testing a deployed stack, `perf/k6/duty.js` asserts p95 < 200 ms on
`GET /api/v1/duties`:

```bash
BASE_URL=https://api.example.test K6_TOKEN=<student token> k6 run perf/k6/duty.js
```

### Sync

`POST /api/v1/sync/push` accepts field-level last-writer-wins registers stamped
with a hybrid logical clock (`lib/hlc.ts`). The server merges, then re-applies
business rules — a client cannot resurrect a deleted or late homework item.
