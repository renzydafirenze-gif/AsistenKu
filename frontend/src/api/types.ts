/**
 * Wire types mirroring `backend/openapi.yaml`. Dates without a time are
 * `YYYY-MM-DD` school-timezone keys; timestamps are ISO-8601 UTC.
 */

export type Role = 'STUDENT' | 'PARENT' | 'TEACHER' | 'CLASS_GUARDIAN';
export type DutyShift = 'MORNING' | 'AFTERNOON';
export type DutyStatus = 'COMPLETED' | 'TODAY' | 'UPCOMING' | 'OVERDUE';
export type UniformStatus = 'COMPLETE' | 'PARTIAL' | 'PENDING' | 'HOLIDAY';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  classId: string | null;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType?: 'Bearer';
  expiresIn?: number;
}

export interface AuthResult {
  user: User;
  tokens: TokenPair;
}

export interface Badge {
  label: string;
  color: string;
}

export interface Countdown {
  days: number;
  hours: number;
  label: string;
  isPast: boolean;
}

export interface Duty {
  id: string;
  classId: string;
  className?: string;
  date: string;
  shift: DutyShift;
  assignedStudentId: string;
  assignedStudentName?: string;
  notes?: string | null;
  completedAt?: string | null;
  status?: DutyStatus;
  countdown?: Countdown;
  canComplete?: boolean;
}

export interface Homework {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  isOverdue?: boolean;
  isLate?: boolean;
  accentColor?: string;
  subject?: { id: string; name: string; code: string } | null;
  assignment?: { status?: string } | null;
}

export interface Exam {
  id: string;
  title: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  isPublished?: boolean;
  isLocked?: boolean;
  daysUntil?: number;
  subject?: { id: string; name: string; code: string } | null;
}

export interface UniformItem {
  key: string;
  label: string;
  category?: string;
  checked: boolean;
  checkedAt?: string | null;
}

export interface UniformChecklist {
  date: string;
  dayType?: string;
  note?: string | null;
  items: UniformItem[];
  completedCount: number;
  total: number;
  status?: UniformStatus;
  badge?: Badge;
}

export interface DashboardCard {
  key: 'duty' | 'uniform' | 'homework' | 'exam' | 'subjects';
  title: string;
  summary: string;
  badge?: Badge;
  route?: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  className?: string | null;
  teacher?: { id: string; fullName: string; email: string } | null;
  homeworkCount?: number;
}

export interface Dashboard {
  date: string;
  greeting: string;
  user: Pick<User, 'id' | 'fullName' | 'role' | 'classId'>;
  palette?: Record<string, string>;
  cards: DashboardCard[];
  detail?: {
    duty?: Duty | null;
    uniform?: UniformChecklist | null;
    homework?: { pending?: Homework[]; lateCount?: number; upcomingCount?: number } | null;
    exam?: Exam | null;
    subjects?: Subject[];
  } | null;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
}
