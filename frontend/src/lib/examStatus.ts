import type { Exam, ExamStatus } from '../types';

/** Auto status from start time + duration (same rules as backend). */
export function effectiveExamStatus(exam: Pick<Exam, 'startDate' | 'durationMinutes'>): ExamStatus {
  const start = new Date(exam.startDate).getTime();
  if (!Number.isFinite(start)) return 'SCHEDULED';
  const durationMs = Math.max(1, Number(exam.durationMinutes) || 60) * 60_000;
  const end = start + durationMs;
  const now = Date.now();
  if (now < start) return 'SCHEDULED';
  if (now < end) return 'LIVE';
  return 'RESULTS_PUBLISHED';
}

export function statusLabel(s: ExamStatus): string {
  switch (s) {
    case 'SCHEDULED': return 'Scheduled';
    case 'LIVE': return 'Live';
    case 'RESULTS_PUBLISHED': return 'Results published';
    case 'ENDED': return 'Ended';
    case 'DRAFT': return 'Scheduled';
    default: return String(s).replace(/_/g, ' ');
  }
}
