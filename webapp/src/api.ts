/** Telegram Mini App API client — talks to Quiz Bot backend */

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getTelegramInitData(): string {
  try {
    const w = window as any;
    return w?.Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

export function getTelegramUser(): { id?: number; first_name?: string; username?: string } | null {
  try {
    const w = window as any;
    return w?.Telegram?.WebApp?.initDataUnsafe?.user || null;
  } catch {
    return null;
  }
}

async function api<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const initData = getTelegramInitData();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, ...(body || {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export type ApiExamSummary = {
  id: string;
  title: string;
  subject: string;
  className: string;
  totalQuestions: number;
  durationMinutes: number;
  totalMarks: number;
  startDate: string;
  status: string;
  resultVisibility: string;
};

export type ApiQuestion = {
  id: string;
  question: string;
  options: string[];
  marks: number;
  negativeMarks: number;
  imageFileId?: string | null;
  /** Only present after submit / review */
  answer?: number | null;
  explanation?: string;
};

export type ApiAttempt = {
  id: string;
  examId: string;
  status: string;
  currentQuestionIndex: number;
  answers: Record<string, number>;
  score?: number;
  maxScore?: number;
  percentage?: number;
  correctCount?: number;
  wrongCount?: number;
  skippedCount?: number;
  timeTakenSeconds?: number;
  expiresAt?: string;
  startedAt?: string;
  isOfficial?: boolean;
  attemptNumber?: number;
  rank?: number | null;
};

export const webappApi = {
  session: () =>
    api<{
      user: { id: number; firstName?: string; username?: string };
      student: {
        id: string;
        name: string;
        studentId: string;
        className: string;
        telegramUserId: number;
        status: string;
      } | null;
    }>('/api/webapp/session'),

  exams: () => api<{ exams: ApiExamSummary[] }>('/api/webapp/exams'),

  examDetail: (examId: string) =>
    api<{ exam: ApiExamSummary & { negativeMarking: number } }>('/api/webapp/exam', { examId }),

  startExam: (examId: string, forceNew?: boolean) =>
    api<{ attempt: ApiAttempt; exam: ApiExamSummary; questions: ApiQuestion[]; secondsLeft: number }>(
      '/api/webapp/start',
      { examId, forceNew: !!forceNew }
    ),

  saveAnswer: (attemptId: string, questionId: string, optionIndex: number | null) =>
    api<{ ok: boolean }>('/api/webapp/answer', { attemptId, questionId, optionIndex }),

  setIndex: (attemptId: string, index: number) =>
    api<{ ok: boolean }>('/api/webapp/index', { attemptId, index }),

  submit: (attemptId: string) =>
    api<{ attempt: ApiAttempt }>('/api/webapp/submit', { attemptId }),

  results: () => api<{ results: Array<ApiAttempt & { examTitle: string }> }>('/api/webapp/results'),

  review: (attemptId: string) =>
    api<{
      exam: { id: string; title: string; subject: string };
      attempt: ApiAttempt;
      questions: Array<
        ApiQuestion & {
          selectedIndex: number | null;
          correctIndex: number | null;
          status: 'correct' | 'wrong' | 'unattempted';
        }
      >;
    }>('/api/webapp/review', { attemptId }),

  leaderboard: (examId: string) =>
    api<{
      exam: { id: string; title: string };
      rows: Array<{ rank: number; name: string; score: number; percentage: number; isMe: boolean }>;
    }>('/api/webapp/leaderboard', { examId }),
};
