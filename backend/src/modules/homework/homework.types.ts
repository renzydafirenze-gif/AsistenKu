import type { HomeworkStatus } from '../../domain/enums';

/** Status colours from the product palette (green/yellow/red + neutral). */
export const HOMEWORK_COLORS = {
  ON_TIME: '#27AE60',
  UPCOMING: '#F39C12',
  LATE: '#C0392B',
  GRADED: '#2E86C1',
  DONE: '#27AE60',
} as const;

export interface HomeworkSummary {
  total: number;
  pending: number;
  submitted: number;
  graded: number;
  late: number;
}

export interface HomeworkDto {
  id: string;
  subject: { id: string; name: string; code: string };
  classId: string | null;
  title: string;
  description: string | null;
  dueDate: string;
  publishedAt: string | null;
  createdAt: string;
  isOverdue: boolean;
  isLate: boolean;
  /** Badge colour the client renders directly. */
  accentColor: string;
  /** `null` when the viewer is staff (use `summary` instead). */
  assignment: { studentId: string; studentName: string } | null;
  status: HomeworkStatus;
  submittedAt: string | null;
  grade: number | null;
  feedback: string | null;
  summary?: HomeworkSummary;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canSubmit: boolean;
    canGrade: boolean;
  };
}