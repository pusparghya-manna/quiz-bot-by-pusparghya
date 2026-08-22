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
  /** Last bot message id — edit this instead of sending new menus */
  lastMessageId?: number;
};

const sessions = new Map<number, KbSession>();

export function getKbSession(userId: number): KbSession | undefined {
  return sessions.get(userId);
}

export function setKbSession(userId: number, s: KbSession) {
  const prev = sessions.get(userId);
  if (prev?.lastMessageId != null && s.lastMessageId == null) {
    s = { ...s, lastMessageId: prev.lastMessageId };
  }
  sessions.set(userId, s);
  if (sessions.size > 5000) {
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
    // Keeps the chat input from inviting free-text focus on many clients
    input_field_placeholder: 'Tap a button below',
  } as ReplyKeyboardMarkup;
}

/** Only for deliberate name entry — opens the native typing keyboard. */
export function forceReplyNameMarkup(): { force_reply: true; selective: boolean; input_field_placeholder: string } {
  return {
    force_reply: true,
    selective: true,
    input_field_placeholder: 'Type your name…',
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
export function numberedListRows(
  titles: string[],
  footer: string[][]
): { rows: string[][]; labels: Record<string, string> } {
  const labels: Record<string, string> = {};
  const rows: string[][] = [];
  titles.forEach((title, i) => {
    const label = `${i + 1}. ${(title || 'Item').slice(0, 40)}`.slice(0, 64);
    labels[label] = String(i);
    rows.push([label]);
  });
  for (const f of footer) rows.push(f);
  return { rows, labels };
}
