import { prisma } from '../../db/prisma';
import { addDays, diffInDays, parseDateKey, todayUtcMidnight, todayKey, toDateKey } from '../../lib/dates';
import type { AuthUser } from '../../types/express';
import { listDuties } from '../duty/duty.service';
import { listHomework } from '../homework/homework.service';
import { listExams } from '../exam/exam.service';
import { listSubjects } from '../subject/subject.service';
import { getChecklist } from '../uniform/uniform.service';
import { isPastDue } from '../homework/homework.service';

/** Palette tokens shared with the mobile theme. */
export const PALETTE = {
  primary: '#2E86C1',
  secondary: '#F39C12',
  accent: '#27AE60',
  danger: '#C0392B',
  neutral: '#7F8C8D',
} as const;

export interface DashboardCard {
  key: 'duty' | 'uniform' | 'homework' | 'exam' | 'subjects';
  title: string;
  summary: string;
  badge: { label: string; color: string };
  route: string;
}

export async function buildDashboard(actor: AuthUser, dateKey: string = todayKey(), now: Date = new Date()) {
  const day = parseDateKey(dateKey);

  const [subjects, duties, homework, exams, uniform] = await Promise.all([
    listSubjects(actor),
    listDuties(actor, { limit: 10, from: dateKey, to: toDateKey(addDays(day, 14)) }, now),
    listHomework(actor, { limit: 50 }, now),
    listExams(actor, { from: dateKey, to: toDateKey(addDays(day, 120)) }, now),
    actor.role === 'STUDENT' || actor.role === 'PARENT'
      ? getChecklist(actor, actor.role === 'STUDENT' ? actor.id : (await firstWardId(actor)) ?? actor.id, dateKey).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  const nextDuty = duties.items.find((duty) => duty.status !== 'COMPLETED') ?? duties.items[0] ?? null;

  const pendingHomework = homework.items.filter((item) => item.status === 'PENDING');
  const lateHomework = homework.items.filter((item) => item.isLate);

  const nextExam = exams.items[0] ?? null;

  const cards: DashboardCard[] = [
    {
      key: 'duty',
      title: 'Piket',
      summary: nextDuty
        ? `${nextDuty.countdown.label} · ${nextDuty.shift === 'MORNING' ? 'Pagi' : 'Siang'} · ${nextDuty.assignedStudentName}`
        : 'Tidak ada jadwal piket',
      badge: nextDuty
        ? nextDuty.status === 'COMPLETED'
          ? { label: 'Selesai', color: PALETTE.accent }
          : nextDuty.status === 'TODAY'
            ? { label: 'Hari ini', color: PALETTE.secondary }
            : nextDuty.status === 'OVERDUE'
              ? { label: 'Terlewat', color: PALETTE.danger }
              : { label: nextDuty.countdown.label, color: PALETTE.primary }
        : { label: 'Kosong', color: PALETTE.neutral },
      route: '/duty',
    },
    {
      key: 'uniform',
      title: 'Seragam',
      summary: uniform
        ? uniform.status === 'HOLIDAY'
          ? 'Hari libur, tidak ada checklist'
          : `${uniform.completedCount}/${uniform.total} item lengkap`
        : 'Checklist belum tersedia',
      badge: uniform
        ? { label: uniform.badge.label, color: uniform.badge.color }
        : { label: 'N/A', color: PALETTE.neutral },
      route: '/uniform',
    },
    {
      key: 'homework',
      title: 'Tugas',
      summary:
        pendingHomework.length === 0
          ? 'Semua tugas sudah dikumpulkan'
          : `${pendingHomework.length} tugas belum selesai${lateHomework.length > 0 ? `, ${lateHomework.length} terlambat` : ''}`,
      badge:
        lateHomework.length > 0
          ? { label: 'Terlambat', color: PALETTE.danger }
          : pendingHomework.length > 0
            ? { label: 'Menunggu', color: PALETTE.secondary }
            : { label: 'Beres', color: PALETTE.accent },
      route: '/homework',
    },
    {
      key: 'exam',
      title: 'Ujian',
      summary: nextExam ? `${nextExam.subject.name} · ${nextExam.examDate} ${nextExam.startTime}` : 'Belum ada ujian terjadwal',
      badge: nextExam
        ? nextExam.daysUntil <= 3
          ? { label: nextExam.daysUntil <= 0 ? 'Hari ini' : `H-${nextExam.daysUntil}`, color: PALETTE.secondary }
          : { label: `H-${nextExam.daysUntil}`, color: PALETTE.primary }
        : { label: 'Kosong', color: PALETTE.neutral },
      route: '/exams',
    },
    {
      key: 'subjects',
      title: 'Mata Pelajaran',
      summary: `${subjects.items.length} mata pelajaran`,
      badge: { label: 'Lihat', color: PALETTE.primary },
      route: '/subjects',
    },
  ];

  return {
    date: dateKey,
    greeting: greetingFor(now),
    user: { id: actor.id, fullName: actor.fullName, role: actor.role, classId: actor.classId },
    palette: PALETTE,
    cards,
    detail: {
      duty: nextDuty,
      uniform,
      homework: {
        pending: pendingHomework.slice(0, 5),
        lateCount: lateHomework.length,
        upcomingCount: homework.items.filter((item) => !isPastDue({ dueDate: new Date(item.dueDate) }, now)).length,
      },
      exam: nextExam,
      subjects: subjects.items,
    },
  };
}

function greetingFor(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(now),
  );
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

async function firstWardId(actor: AuthUser): Promise<string | null> {
  const link = await prisma.guardianLink.findFirst({ where: { parentId: actor.id }, orderBy: { createdAt: 'asc' } });
  return link?.studentId ?? null;
}

/** Days until the next exam, used by the exam tab badge. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return diffInDays(todayUtcMidnight(now), date);
}