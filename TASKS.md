# Project Overview & Scope
- **Vision**: A mobile assistant for high‑school students that centralises duty schedules, uniform checklists, homework, exams, and school activities.
- **Project Type**: Mobile‑app (iOS & Android).
- **Primary Tech Stack**: Node.js backend, PostgreSQL database, React Native frontend.
- **Key Users**: Students, parents, teachers, class‑guardians.
- **Design Style**: Clean student dashboard, color‑coded schedule cards, calendar view, fully responsive.

# Implementation Order
1. Foundations & tooling
2. Domain model & authentication
3. Core features & business logic
4. Business rules & invariants
5. UI/UX presentation & interaction
6. Testing, hardening & deployment

Legend: `[x]` done and verified locally · `[~]` done with a documented limit · `[ ]` not started.

# Phase Breakdown & Actionable Tasks
## Phase 1: Setup & Foundations
- [x] Initialise Git repo and create CI/CD pipeline (GitHub Actions).
      Repo initialised; CI workflow (`.github/workflows/ci.yml`, backend + app jobs) present.
- [x] Scaffold Node.js backend with Express, TypeScript, ESLint, Prettier.
- [x] Scaffold React Native project (Expo or bare) with TypeScript, ESLint.
- [x] Configure PostgreSQL local dev instance and Docker Compose.
      `docker-compose.yml` + `backend/Dockerfile`; local runs can also use `npm run demo` (SQLite).
- [x] Implement environment‑variable management (dotenv, .env.example).
- [ ] Add lint‑staged and husky pre‑commit hooks.
- [x] Set up basic Dockerfiles for backend and frontend.
      Backend image only — the app ships as an APK/IPA, not a container.
- [x] Create initial README and project documentation template.

## Phase 2: Domain Model & Authentication
- [x] Define entities: User, Role, DutySchedule, Uniform, Homework, Exam, Subject, Teacher, Notification.
- [x] Generate PostgreSQL migrations for all tables with foreign keys and indexes.
- [x] Implement JWT‑based authentication with role‑based access control.
- [x] Add password hashing (bcrypt) and optional social login.
- [x] Create basic CRUD API endpoints for each entity.
- [x] Implement role‑specific data access rules (student vs teacher vs guardian).
- [x] Add unit tests for authentication flows.

## Phase 3: Core Features & Business Logic
- [x] **Duty Schedule**: CRUD for duty entries, H‑1 push notifications via Firebase Cloud Messaging.
      FCM HTTP v1 + APNS implemented; providers dry‑run until credentials are set.
- [x] **Uniform Checklist**: Daily checklist UI, sync with academic calendar, mark items as completed.
- [x] **Homework Management**: Create, update, delete homework; set deadlines; track status (Pending, Completed, Late).
- [x] **Exam Calendar**: Publish exam dates; display in calendar view; prevent edits after publish.
      List view in the app; no month grid yet.
- [x] **Subject & Teacher List**: CRUD subjects, assign teachers, display in dashboard.
      App has a dedicated Mapel tab listing every subject with its teacher.
- [x] **School Activity Reminders**: Add events, set reminders, push notifications.
      Backend notifications + scheduler endpoint; app does not register push tokens yet.
- [x] Implement offline caching (SQLite) for critical data.
      The app is fully offline: user-owned dataset persisted in AsyncStorage (`frontend/src/offline`), no API client and no INTERNET permission. SQLite/WatermelonDB not used; the user can clear or load example data from Pengaturan.
- [x] Add server‑side validation for all inputs.

## Phase 4: Business Rules & Invariants
- [x] Enforce *notification rule*: only the student assigned to a duty receives the H‑1 alert.
- [x] Make exam dates immutable after teacher publishes.
- [x] Validate uniform data against the school’s academic calendar.
- [x] Flag late homework in red; prevent deletion of late homework.
- [x] Add audit logs for critical changes.

## Phase 5: UI/UX Presentation & Interaction
- [x] Design wireframes for dashboard, schedule cards, calendar, and checklist screens.
      Implemented directly as screens; no separate wireframe artefacts.
- [x] Implement responsive layouts for iOS and Android.
- [x] Apply color‑coding: green for on‑time, yellow for upcoming, red for overdue.
- [x] Ensure accessibility (contrast, screen‑reader labels, touch targets).
      Contrast gate in `frontend/tests/contrast.test.ts`, roles/labels/48dp targets in components.
- [x] Add smooth navigation (React Navigation) and state management (Redux Toolkit).
- [ ] Integrate push‑notification handling in the app.
      Deliberately out of scope for the offline build; backend push providers exist.
- [ ] Conduct usability tests with a small student group.

## Phase 6: Testing, Hardening & Deployment
- [x] Write unit tests for backend services (Jest, Supertest).
- [x] Write integration tests for API endpoints.
- [ ] Implement end‑to‑end tests with Detox or Appium.
- [~] Perform security audits (OWASP Top 10, dependency‑check).
      JWT/RBAC/rate‑limit/encryption/audit hardening done; no third‑party pentest, `npm audit` not triaged.
- [x] Benchmark API response times; optimize slow queries.
      `tests/perf/latency.test.ts` (p95 < 200 ms) + `perf/k6/duty.js` for a deployed stack.
- [x] Configure CI to run tests, lint, and build.
- [~] Build release binaries for iOS (App Store) and Android (Play Store).
      Android release APK builds and installs offline (debug keystore); no iOS build, no store signing.
- [ ] Set up production PostgreSQL, environment variables, and SSL.
- [ ] Deploy backend to a managed service (Heroku, Render, or AWS Elastic Beanstalk).
- [ ] Monitor logs and set up alerts.

# Definition of Done (DoD)
- All features listed in Phase 3 are fully implemented and pass unit/integration tests. — **yes**, except the noted offline‑sync and app push gaps.
- Business rules from Phase 4 are enforced and validated. — **yes**, each rule has a test.
- UI meets accessibility standards (WCAG 2.1 AA) and passes usability tests. — a11y gated in tests; usability testing **not** done.
- End‑to‑end tests cover critical user flows. — **no** (Detox pending).
- Security audit shows no critical vulnerabilities. — hardening in place; independent audit **not** done.
- Performance benchmarks meet target thresholds (API <200 ms, app launch <3 s). — API latency gated; app launch not measured.
- App is published to both App Store and Play Store, with automated CI/CD pipelines. — **no**; CI exists, store publishing does not.
- Documentation is complete: README, API docs, developer guide, and user guide. — README + `openapi.yaml` done; no end‑user guide.
