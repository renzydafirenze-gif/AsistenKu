-- Hardening migration: PostgreSQL-only constraints that Prisma cannot express.
-- The SQLite test mirror deliberately skips these (see scripts/gen-test-schema.cjs);
-- every rule below is also enforced in the service layer so both engines agree.

-- Defence in depth for PII at rest. Application-level AES-256-GCM
-- (src/lib/fieldCrypto.ts) is the primary control; pgcrypto protects backups and
-- ad-hoc DBA reads of the encrypted columns.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Domain invariants -------------------------------------------------------

-- Grade books are 0-100, and a grade only exists once it is recorded.
ALTER TABLE "HomeworkSubmission"
  ADD CONSTRAINT "HomeworkSubmission_grade_range"
  CHECK ("grade" IS NULL OR ("grade" >= 0 AND "grade" <= 100));

ALTER TABLE "HomeworkSubmission"
  ADD CONSTRAINT "HomeworkSubmission_graded_consistency"
  CHECK (("status" = 'GRADED') = ("grade" IS NOT NULL));

-- A duty is "complete" only together with the actor who completed it, so the
-- audit trail can never point at an orphaned completion.
ALTER TABLE "DutySchedule"
  ADD CONSTRAINT "DutySchedule_completion_consistency"
  CHECK (("completedAt" IS NULL) = ("completedById" IS NULL));

-- Publication is all-or-nothing: an exam either has both stamps or neither.
ALTER TABLE "ExamSchedule"
  ADD CONSTRAINT "ExamSchedule_publish_consistency"
  CHECK (("publishedAt" IS NULL) = ("publishedById" IS NULL));

-- Wall-clock times are stored as HH:MM; reject anything else at the boundary.
ALTER TABLE "ExamSchedule"
  ADD CONSTRAINT "ExamSchedule_time_format"
  CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "endTime"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "endTime" > "startTime");

ALTER TABLE "SchoolClass"
  ADD CONSTRAINT "SchoolClass_grade_level"
  CHECK ("gradeLevel" BETWEEN 1 AND 12);

-- A parent cannot be their own child.
ALTER TABLE "GuardianLink"
  ADD CONSTRAINT "GuardianLink_not_self"
  CHECK ("parentId" <> "studentId");

-- Counters never go negative.
ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "NotificationLog_attempts_non_negative"
  CHECK ("attempts" >= 0);

ALTER TABLE "EntityState"
  ADD CONSTRAINT "EntityState_version_positive"
  CHECK ("version" > 0);

-- JSON blobs must be valid JSON even when written outside Prisma.
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_metadata_json" CHECK ("metadata"::jsonb IS NOT NULL);
ALTER TABLE "SyncChange"
  ADD CONSTRAINT "SyncChange_payload_json" CHECK ("payload"::jsonb IS NOT NULL);
ALTER TABLE "EntityState"
  ADD CONSTRAINT "EntityState_fieldClocks_json" CHECK ("fieldClocks"::jsonb IS NOT NULL);

-- Uniqueness that soft deletes must not defeat -----------------------------
-- A class has at most one duty per shift per day among *live* rows, so a deleted
-- duty frees the slot for reassignment. Prisma cannot express a partial index,
-- which is why DutySchedule has no @@unique in the schema; this index is the
-- database-level guarantee behind the service check.
CREATE UNIQUE INDEX "DutySchedule_live_slot_key"
  ON "DutySchedule" ("classId", "date", "shift")
  WHERE "deletedAt" IS NULL;

-- Exam slots and uniform checklists already carry @@unique in the Prisma schema.
-- Those constraints include soft-deleted rows by design: a slot stays reserved
-- after deletion so historical timetables cannot be silently reused.

-- Query support -----------------------------------------------------------

-- H-1 reminder scan: "live duties on this date", then filter by completion.
CREATE INDEX IF NOT EXISTS "DutySchedule_reminder_scan_idx"
  ON "DutySchedule" ("date")
  WHERE "deletedAt" IS NULL AND "completedAt" IS NULL;

-- Login and roster listing only ever read live, active accounts.
CREATE INDEX IF NOT EXISTS "User_live_email_idx"
  ON "User" ("email")
  WHERE "deletedAt" IS NULL;

-- Dashboard and exam calendar read published, live exams by class.
CREATE INDEX IF NOT EXISTS "ExamSchedule_live_published_idx"
  ON "ExamSchedule" ("classId", "examDate")
  WHERE "deletedAt" IS NULL AND "publishedAt" IS NOT NULL;

-- Audit trail is append-only ----------------------------------------------

CREATE OR REPLACE FUNCTION "auditlog_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (delete attempted)';
END;
$$ LANGUAGE plpgsql;

-- Deletes are blocked outright. UPDATE is left open because the actor foreign
-- key uses ON DELETE SET NULL, which requires an update when an account is
-- erased; tampering is caught by the append-only writer in src/lib/audit.ts.
DROP TRIGGER IF EXISTS "AuditLog_no_delete" ON "AuditLog";
CREATE TRIGGER "AuditLog_no_delete"
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "auditlog_block_mutation"();
