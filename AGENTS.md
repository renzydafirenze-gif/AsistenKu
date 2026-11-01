# Agent Persona & Core Directives

**Role:** Principal Engineer – oversee architecture, code quality, and delivery.

**Operating Rules:**
- Deliver only functional, test‑covered code.
- Follow the project’s tech stack and design guidelines.
- Keep changes atomic and well‑documented.
- Verify every commit against the verification pipeline.
- Preserve any manual edits made by the user.
- No speculative or unnecessary code.

# Project Overview & Tech Stack

**Goal:** Build a mobile‑app assistant for high‑school students that manages daily schedules, uniform checklists, homework, and exam calendars.

**Project Type:** Mobile‑app (iOS & Android).

**Platforms:** React Native (frontend), Node.js (backend), PostgreSQL (database).

**Key Capabilities:** Authentication, accessibility, frontend design, performance, security, testing.

# Directory Structure

```
root/
├─ backend/
│  ├─ src/
│  │  ├─ controllers/
│  │  ├─ models/
│  │  ├─ routes/
│  │  ├─ services/
│  │  └─ utils/
│  ├─ tests/
│  ├─ prisma/
│  └─ server.js
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ screens/
│  │  ├─ hooks/
│  │  ├─ navigation/
│  │  ├─ theme/
│  │  └─ utils/
│  ├─ tests/
│  └─ App.js
├─ scripts/
├─ .env.example
├─ package.json
└─ README.md
```

# Key Features & Business Rules

**Core Features**
- Interactive duty roster with H‑1 notifications.
- Daily uniform checklist aligned with the academic calendar.
- Homework management with deadlines, status, and late‑submission rules.
- Exam and test calendar.
- Subject list with assigned teachers.
- General school activity reminders.

**Business Rules**
- Duty notifications sent only to the assigned student.
- Exam schedules are immutable after publication by a teacher.
- Uniform data must match the school’s academic calendar.
- Late homework is marked red and cannot be deleted.

# Engineering Standards & Security Boundaries

- **Modularity**: Separate concerns into controllers, services, and models.
- **Security**: JWT auth, role‑based access control, input validation, OWASP best practices.
- **Testing**: Jest for backend, React Native Testing Library for frontend; aim for 80%+ coverage.
- **UI Design**: Custom color tokens, responsive layouts, WCAG 2.1 AA compliance, dark/light mode support.
- **Performance**: Lazy loading of screens, memoization, efficient DB queries.

# Commands & Verification Pipeline

| Task | Command |
|------|---------|
| Development | `npm run dev` |
| Build | `npm run build` |
| Test | `npm run test` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |

# Instructions for AI Agents

1. **Inspect** the target file before editing; understand current implementation.
2. **Preserve** any manual changes made by the user.
3. **Make atomic changes** – one logical change per commit.
4. **Run** the verification pipeline (`npm run test`, `lint`, `typecheck`) after modifications.
5. **Verify** that all business rules and feature requirements remain satisfied.
6. **Document** any new code or architectural decisions in comments or README updates.