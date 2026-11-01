# AsistenKu (AKU)

Offline mobile assistant for Indonesian high-school students: duty roster
(piket), uniform checklist tied to the academic calendar, homework with
late-work rules, exam calendar, subjects and teachers. Everything runs on the
device — no account, no server, no INTERNET permission.

The `backend/` folder is a reference REST API kept for a future online mode; the
shipped app never calls it.

| Part | Stack | Docs |
| --- | --- | --- |
| `backend/` | Node 18.18, TypeScript, Express, Prisma, PostgreSQL 15 | [backend/README.md](backend/README.md) · [openapi.yaml](backend/openapi.yaml) |
| `frontend/` | Expo SDK 50 / React Native 0.73.6, TypeScript, Redux Toolkit — **100% offline** | [frontend/README.md](frontend/README.md) |

## Quick start

```bash
# API (needs PostgreSQL 15, or use docker compose below)
cd backend
cp .env.example .env     # set JWT_SECRET and FIELD_ENCRYPTION_KEY
npm ci && npm run prisma:migrate && npm run dev

# App (no server, no login, no INTERNET permission)
cd frontend
npm install && npm start
```

No PostgreSQL handy? The API runs on a seeded SQLite demo database:

```bash
cd backend && npm run demo    # ani@sekolah.test / Rahasia123
```

Whole stack with a database:

```bash
JWT_SECRET=... FIELD_ENCRYPTION_KEY=... docker compose up --build
```

## Verify

```bash
cd backend  && npm run lint && npm run typecheck && npm run openapi:lint && npm run test:coverage && npm run build
cd frontend && npm run lint && npm run typecheck && npm run test:coverage
```

CI runs both jobs (`.github/workflows/ci.yml`): backend uses a SQLite mirror of
the Prisma schema so no database service is needed on the runner.

## Business rules

| Rule | Where |
| --- | --- |
| H-1 duty reminder only to the assigned student | `backend/src/modules/notifications` |
| Published exam is immutable (403 + audit log) | `backend/src/modules/exam` |
| Uniform checklist validated against the academic calendar | `backend/src/modules/uniform` |
| Late homework is red and undeletable | `backend/src/modules/homework`, `frontend/src/screens/HomeworkScreen.tsx` |
| Critical changes audited (append-only) | `backend/src/lib/audit.ts`, DB trigger in the hardening migration |

## Status

Implemented and tested: backend API (auth/RBAC, all Phase 3–4 features, sync,
push providers, migrations, OpenAPI, Docker, CI) and the app (dashboard, duty,
homework, exams, uniform, light/dark WCAG-checked theme) running entirely on a
bundled local dataset — the APK ships without the INTERNET permission.

Not yet: data export/import or multi-device sync, Detox E2E, store release
pipelines.
