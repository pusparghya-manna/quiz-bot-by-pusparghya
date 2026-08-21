import type { ReplyKeyboardMarkup } from '../types.js';

export type KbScreen =
  | 'main'
  | 'exams'
  | 'exam_opts'
  | 'results'
  | 'result_detail'
  | 'review'
  | 'lb_pick'
  | 'lb_exam'
  | 'in_exam'
  | 'grid'
  | 'submit_confirm';

export type KbSession = {
  screen: KbScreen;
  examIds?: string[];
  attemptIds?: string[];
  examId?: string;
  attemptId?: string;
  qIdx?: number;
  reviewPage?: number;
  gridPage?: number;
  /** Map button label → action payload */
  labels?: Record<string, string>;
};

const sessions = new Map<number, KbSession>();

export function getKbSession(userId: number): KbSession | undefined {
  return sessions.get(userId);
}

export function setKbSession(userId: number, s: KbSession) {
  sessions.set(userId, s);
  if (sessions.size > 5000) {
    // drop arbitrary old entries
    let n = 0;
    for (const k of sessions.keys()) {
      sessions.delete(k);
      if (++n > 500) break;
    }
  }
}

export function clearKbSession(userId: number) {
  sessions.delete(userId);
}

export function kbMarkup(rows: string[][], opts?: { oneTime?: boolean }): ReplyKeyboardMarkup {
  return {
    keyboard: rows.map((row) => row.map((text) => ({ text: text.slice(0, 64) }))),
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: opts?.oneTime || false,
  };
}

export const LABELS = {
  exams: '📚 My Exams',
  results: '📊 My Results',
  leaderboard: '🏆 Leaderboard',
  setName: '✏️ Set my name',
  home: '🏠 Main menu',
  backExams: '📚 Back to My Exams',
  otherLb: '🏆 Other exams',
  showFullLb: 'Show full ranking',
  startExam: '▶️ Start Exam',
  continueExam: '▶️ Continue Exam',
  viewResult: '📊 View Result',
  reattempt: '🔁 Re-attempt (Practice)',
  practiceAgain: '🔁 Practice again',
  examLb: '🏆 Exam Leaderboard',
  review: '📖 Review answers',
  scoreSum: '📊 Score summary',
  prev: '◀ Previous',
  next: 'Next ▶',
  prevPage: '◀ Prev page',
  nextPage: 'Next page ▶',
  grid: '📋 Question Grid',
  submit: '✅ Submit Exam',
  confirmSubmit: '🚀 Yes, Submit Exam Now',
  continueAns: '🔙 Continue Answering',
  myResults: '📊 My Results',
} as const;

export function mainNavRows(): string[][] {
  return [
    [LABELS.exams, LABELS.results],
    [LABELS.leaderboard, LABELS.setName],
  ];
}

/** Build numbered list buttons + optional footer rows */
export function numberedListRows(titles: string[], footer: string[][]): { rows: string[][]; labels: Record<string, string> } {
  const labels: Record<string, string> = {};
  const rows: string[][] = [];
  let row: string[] = [];
  titles.forEach((title, i) => {
    const label = `${i + 1}. ${(title || 'Item').slice(0, 40)}`.slice(0, 64);
    labels[label] = String(i);
    row.push(label);
    if (row.length === 1) {
      // one exam per row for readability
      rows.push(row);
      row = [];
    }
  });
  if (row.length) rows.push(row);
  for (const f of footer) rows.push(f);
  return { rows, labels };
}
