/** Telegram Mini App API client — Railway quiz-bot backend only */

const DEFAULT_API = 'https://quiz-bot-by-pusparghya-production.up.railway.app';

export const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API).replace(/\/$/, '');

export function getTelegramInitData(): string {
  try {
    const w = window as any;
    return String(w?.Telegram?.WebApp?.initData || '');
  } catch {
    return '';
  }
}

export function getTelegramUser(): {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
} | null {
  try {
    const w = window as any;
    return w?.Telegram?.WebApp?.initDataUnsafe?.user || null;
  } catch {
    return null;
  }
}

/** True only when Telegram injected a signed initData string (not a normal browser). */
export function isTelegramWebApp(): boolean {
  return getTelegramInitData().length > 0;
}

export function mediaUrl(pathOrFileId: string | null | undefined): string | null {
  if (!pathOrFileId) return null;
  if (pathOrFileId.startsWith('http://') || pathOrFileId.startsWith('https://')) {
    return pathOrFileId;
  }
  if (pathOrFileId.startsWith('/')) return `${API_BASE}${pathOrFileId}`;
  return `${API_BASE}/api/media/telegram/${encodeURIComponent(pathOrFileId)}`;
}

async function api<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const initData = getTelegramInitData();
  if (!initData) {
    throw new Error('Telegram login required. Open this app from the Quiz Bot in Telegram.');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, ...(body || {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
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
  resultVisibility?: string;
  leaderboardVisibility?: string;
  negativeMarking?: number;
};

export type ApiQuestion = {
  id: string;
  question: string;
  options: string[];
  marks: number;
  negativeMarks: number;
  subject?: string;
  imageFileId?: string | null;
  imageUrl?: string | null;
  explanation?: string;
  selectedIndex?: number | null;
  correctIndex?: number | null;
  status?: 'correct' | 'wrong' | 'unattempted';
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
  submittedAt?: string | null;
  isOfficial?: boolean;
  attemptNumber?: number;
  rank?: number | null;
  studentName?: string;
  studentId?: string;
};

export const webappApi = {
  session: () =>
    api<{
      user: {
        id: number;
        firstName?: string;
        lastName?: string;
        username?: string;
      };
      student: {
        id: string;
        name: string;
        studentId: string;
        className: string;
        telegramUserId: number;
        status: string;
      } | null;
      ongoing: {
        attemptId: string;
        examId: string;
        examTitle: string;
        secondsLeft: number;
        currentQuestionIndex: number;
        answeredCount: number;
        totalQuestions: number;
      } | null;
    }>('/api/webapp/session'),

  updateProfile: (name: string) =>
    api<{
      student: {
        id: string;
        name: string;
        studentId: string;
        className: string;
        telegramUserId: number;
        status: string;
      };
    }>('/api/webapp/profile', { name }),

  exams: () => api<{ exams: ApiExamSummary[] }>('/api/webapp/exams'),

  examDetail: (examId: string) =>
    api<{ exam: ApiExamSummary }>('/api/webapp/exam', { examId }),

  startExam: (examId: string, forceNew?: boolean) =>
    api<{
      attempt: ApiAttempt;
      exam: ApiExamSummary;
      questions: ApiQuestion[];
      secondsLeft: number;
    }>('/api/webapp/start', { examId, forceNew: !!forceNew }),

  saveAnswer: (attemptId: string, questionId: string, optionIndex: number | null) =>
    api<{ ok: boolean }>('/api/webapp/answer', { attemptId, questionId, optionIndex }),

  setIndex: (attemptId: string, index: number) =>
    api<{ ok: boolean }>('/api/webapp/index', { attemptId, index }),

  submit: (attemptId: string) =>
    api<{ attempt: ApiAttempt }>('/api/webapp/submit', { attemptId }),

  results: () =>
    api<{
      results: Array<
        ApiAttempt & {
          examTitle: string;
          resultVisibility?: string;
        }
      >;
    }>('/api/webapp/results'),

  review: (attemptId: string) =>
    api<{
      exam: { id: string; title: string; subject: string };
      attempt: ApiAttempt;
      questions: ApiQuestion[];
    }>('/api/webapp/review', { attemptId }),

  leaderboard: (examId: string) =>
    api<{
      exam: { id: string; title: string };
      rows: Array<{
        rank: number;
        name: string;
        score: number;
        maxScore?: number;
        percentage: number;
        timeTakenSeconds?: number;
        isMe: boolean;
      }>;
    }>('/api/webapp/leaderboard', { examId }),
};
