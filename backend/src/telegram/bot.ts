import { store } from '../store.js';
import { escapeMd } from '../middleware/validate.js';
import { sendSafeTelegramMessage } from './safeSend.js';
import {
  getKbSession,
  setKbSession,
  kbMarkup,
  LABELS,
  mainNavRows,
  numberedListRows,
} from './replyNav.js';
import {
  TelegramUpdate,
  TelegramUser,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  ReplyKeyboardMarkup,
  SimulatorResponse,
  Attempt,
  Exam,
  Question,
  Student
} from '../types.js';

import {
  calculateAttemptScore,
  updateExamRanks,
} from '../services/scoringService.js';

// Re-export for API/server consumers
export { calculateAttemptScore, updateExamRanks };


/** Resolve examId from callback payloads when IDs contain underscores (e.g. EXAM_ts_rnd). */
function resolveExamIdFromRest(rest: string, trailingCount: number): { examId: string; trailing: number[] } | null {
  const exams = store.getExams();
  const ids = exams.map((e) => e.id).sort((a, b) => b.length - a.length);
  for (const id of ids) {
    if (rest === id && trailingCount === 0) {
      return { examId: id, trailing: [] };
    }
    if (rest.startsWith(id + '_')) {
      const suffix = rest.slice(id.length + 1);
      if (trailingCount === 0) {
        // optional page: only digits
        if (/^\d+$/.test(suffix)) {
          return { examId: id, trailing: [parseInt(suffix, 10)] };
        }
        continue;
      }
      const parts = suffix.split('_');
      if (parts.length === trailingCount && parts.every((x) => /^-?\d+$/.test(x))) {
        return { examId: id, trailing: parts.map((x) => parseInt(x, 10)) };
      }
    }
  }
  // Fallback: last N underscore-separated numeric segments
  if (trailingCount === 0) {
    return { examId: rest, trailing: [] };
  }
  const segs = rest.split('_');
  if (segs.length <= trailingCount) return null;
  const trailing = segs.slice(-trailingCount).map((x) => parseInt(x, 10));
  if (trailing.some((n) => Number.isNaN(n))) return null;
  return { examId: segs.slice(0, -trailingCount).join('_'), trailing };
}


/** Official exam window: [startDate, startDate + durationMinutes) */
function getExamWindow(exam: Exam): { start: number; end: number } {
  const start = new Date(exam.startDate).getTime();
  const end = start + Math.max(1, exam.durationMinutes || 60) * 60 * 1000;
  return { start, end };
}

function isExamWindowOpen(exam: Exam, now = Date.now()): boolean {
  const { start, end } = getExamWindow(exam);
  return now >= start && now < end;
}

function isExamTimeEnded(exam: Exam): boolean {
  return Date.now() >= getExamWindow(exam).end;
}

// Format timer remaining string

/** Users who tapped "Set your name" — next text message becomes their display name */
const pendingNameUsers = new Set<number>();


function mainNavReplyKeyboard() {
  return kbMarkup(mainNavRows());
}

function matchMainNav(text: string): string | null {
  const t = text.trim();
  const map: Record<string, string> = {
    [LABELS.exams]: 'exams',
    [LABELS.results]: 'results',
    [LABELS.leaderboard]: 'leaderboard',
    [LABELS.setName]: 'setName',
    [LABELS.home]: 'home',
    'My Exams': 'exams',
    'My Results': 'results',
    'Leaderboard': 'leaderboard',
    'Leaderboards': 'leaderboard',
    'Set my name': 'setName',
    'Set your name': 'setName',
    'Main menu': 'home',
  };
  return map[t] || null;
}

/** Resolve a reply-keyboard tap using session labels or fixed LABELS. */
function resolveReplyAction(userId: number, text: string): { action: string; arg?: string } | null {
  const raw = text.trim();
  const sess = getKbSession(userId);
  if (sess?.labels && sess.labels[raw] !== undefined) {
    return { action: 'pick', arg: sess.labels[raw] };
  }
  // Fixed labels
  const fixed: Record<string, string> = {
    [LABELS.exams]: 'exams',
    [LABELS.results]: 'results',
    [LABELS.leaderboard]: 'leaderboard',
    [LABELS.setName]: 'setName',
    [LABELS.home]: 'home',
    [LABELS.backExams]: 'back_exams',
    [LABELS.otherLb]: 'lb_pick',
    [LABELS.showFullLb]: 'lb_more',
    [LABELS.startExam]: 'start_exam',
    [LABELS.continueExam]: 'resume_exam',
    [LABELS.viewResult]: 'view_result',
    [LABELS.reattempt]: 'reattempt',
    [LABELS.practiceAgain]: 'reattempt',
    [LABELS.examLb]: 'exam_lb',
    [LABELS.review]: 'review',
    [LABELS.scoreSum]: 'score_sum',
    [LABELS.prev]: 'prev',
    [LABELS.next]: 'next',
    [LABELS.prevPage]: 'prev_page',
    [LABELS.nextPage]: 'next_page',
    [LABELS.grid]: 'grid',
    [LABELS.submit]: 'submit',
    [LABELS.confirmSubmit]: 'do_submit',
    [LABELS.continueAns]: 'continue_ans',
    [LABELS.myResults]: 'results',
  };
  if (fixed[raw]) return { action: fixed[raw] };
  return matchMainNav(raw) ? { action: matchMainNav(raw)! } : null;
}

function formatInIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  // e.g. "12 Aug 2026, 9:30 PM"
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const dayPeriod = (get('dayPeriod') || '').toUpperCase(); // AM / PM
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}

function formatRemaining(expiresAtIso: string): string {
  const expiresAt = new Date(expiresAtIso).getTime();
  const now = Date.now();
  const diff = Math.max(0, expiresAt - now);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function linkStudentToTeacher(student: Student, teacherId?: string | null) {
  if (!teacherId) return student;
  const ids = Array.isArray(student.teacherIds) ? [...student.teacherIds] : [];
  if (!ids.includes(teacherId)) {
    ids.push(teacherId);
    student.teacherIds = ids;
    try {
      await store.saveStudent(student);
    } catch (e: any) {
      console.error('[telegram] linkStudentToTeacher save failed:', e?.message || e);
    }
  }
  return student;
}

export async function getOrCreateStudent(user: TelegramUser): Promise<Student> {
  let student = store.getStudentByTelegramId(user.id);
  const now = new Date().toISOString();

  const telegramUsername = user.username ? `@${user.username}` : undefined;

  let name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (!name && telegramUsername) {
    name = telegramUsername;
  }
  if (!name) {
    name = 'Student';
  }

  if (!student) {
    student = {
      id: `STU_${user.id}`,
      studentId: `S${String(user.id).slice(-6)}`,
      name: name,
      className: 'ALL',
      status: 'linked',
      linkCode: `S${String(user.id).slice(-6)}`,
      telegramUserId: user.id,
      telegramUsername: telegramUsername,
      joinedAt: now,
    };
    try {
      await store.saveStudent(student);
      await store.addAuditLog('STUDENT_AUTO_REGISTERED', `Auto-registered Telegram student ${name} (${telegramUsername || user.id})`);
    } catch (e: any) {
      console.error('[telegram] getOrCreateStudent save failed:', e?.message || e);
    }
  } else {
    let updated = false;
    if (telegramUsername && student.telegramUsername !== telegramUsername) {
      student.telegramUsername = telegramUsername;
      updated = true;
    }
    if (name && (student.name.startsWith('Student #') || !student.name)) {
      student.name = name;
      updated = true;
    }
    if (updated) {
      try {
        await store.saveStudent(student);
      } catch (e: any) {
        console.error('[telegram] getOrCreateStudent update failed:', e?.message || e);
      }
    }
  }

  return student;
}


function renderMainMenu(student: Student): SimulatorResponse {
  const notice = store.getSettings().systemNotice;
  if (student.telegramUserId) {
    setKbSession(student.telegramUserId, { screen: 'main' });
  }
  return {
    chatId: student.telegramUserId!,
    text:
      `👋 *Welcome to Quiz Bot by Pusparghya!*

` +
      (notice ? `📢 ${notice}

` : '') +
      `You are registered as *${escapeMd(student.name)}*.

` +
      `Teachers share a special link for each exam. Open that link to start.

` +
      `_Use the buttons below the chat to navigate._`,
    replyKeyboard: mainNavReplyKeyboard(),
    type: 'sendMessage',
  };
}

function needsNameSetup(student: Student): boolean {
  const n = (student.name || '').trim();
  if (!n) return true;
  if (/^student(\s*#?\d*)?$/i.test(n)) return true;
  return false;
}

/** Bounded in-memory dedup — avoids a Turso round-trip on every button press. */
const recentUpdateIds = new Set<number>();
const RECENT_UPDATE_MAX = 4000;

function rememberUpdateId(id: number) {
  recentUpdateIds.add(id);
  if (recentUpdateIds.size > RECENT_UPDATE_MAX) {
    // drop oldest-ish entries (Set iteration order is insertion order)
    const n = recentUpdateIds.size - RECENT_UPDATE_MAX + 500;
    let i = 0;
    for (const x of recentUpdateIds) {
      recentUpdateIds.delete(x);
      if (++i >= n) break;
    }
  }
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<SimulatorResponse | null> {
  try {
    if (update.update_id != null && recentUpdateIds.has(Number(update.update_id))) {
      return null;
    }
    const result = await processTelegramUpdateInner(update);
    if (update.update_id != null && result !== undefined) {
      rememberUpdateId(Number(update.update_id));
      // Persist claim in background — do not block Telegram reply
      void store.claimTelegramUpdate(Number(update.update_id)).catch(() => {});
    }
    return result;
  } catch (err: any) {
    console.error('[telegram] processTelegramUpdate failed:', err?.message || err);
    return null;
  }
}

async function processTelegramUpdateInner(update: TelegramUpdate): Promise<SimulatorResponse | null> {
  const now = new Date();

  // Handle callback queries (button clicks)
  if (update.callback_query) {
    const cb = update.callback_query;
    const user = cb.from;
    const data = cb.data || '';
    const student = await getOrCreateStudent(user);
    const cbMessageId = cb.message?.message_id;

    let response: SimulatorResponse | null = null;

    // 1. Navigation / List Exams
    if (data === 'btn_home' || data === 'btn_menu') {
      pendingNameUsers.delete(user.id);
      response = renderMainMenu(student);
    } else if (data === 'btn_setname') {
      pendingNameUsers.add(user.id);
      response = {
        chatId: user.id,
        text: `✏️ *Set your name*

Please *type your full name* and send it as a message.

This name will appear on results and the leaderboard.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🏠 Main menu', callback_data: 'btn_home' }]
          ]
        },
        type: 'editMessageText'
      };
    } else if (data === 'btn_exams') {
      response = renderExamsList(student);
    } else if (data.startsWith('exam_view_')) {
      const examId = data.replace('exam_view_', '');
      response = renderExamOptions(examId, student);
    } else if (data === 'btn_results') {
      response = renderStudentResults(student);
    } else if (data === 'btn_leaderboard') {
      response = renderLeaderboardExamPicker(student);
    } else if (data.startsWith('lb_exam_')) {
      const examId = data.replace('lb_exam_', '');
      response = renderExamLeaderboard(examId, student, false);
    } else if (data.startsWith('lb_more_')) {
      const examId = data.replace('lb_more_', '');
      response = renderExamLeaderboard(examId, student, true);
    } else if (data === 'leaderboard_more') {
      // legacy — show picker
      response = renderLeaderboardExamPicker(student);
    } else if (data.startsWith('start_exam_') || data.startsWith('resume_exam_')) {
      const examId = data.replace('start_exam_', '').replace('resume_exam_', '');
      response = await handleStartOrResumeExam(examId, student, user);
    } else if (data.startsWith('reattempt_')) {
      const examId = data.replace('reattempt_', '');
      response = await handleStartOrResumeExam(examId, student, user, true);
    } else if (data.startsWith('ans_')) {
      // ans_EXAMID_qIdx_optIdx — exam IDs may contain underscores
      const rest = data.slice(4);
      const parsed = resolveExamIdFromRest(rest, 2);
      if (parsed) {
        const [qIdx, optIdx] = parsed.trailing;
        response = await handleOptionSelect(parsed.examId, qIdx, optIdx, student, user);
      }
    } else if (data.startsWith('nav_')) {
      // nav_EXAMID_targetIdx
      const rest = data.slice(4);
      const parsed = resolveExamIdFromRest(rest, 1);
      if (parsed) {
        response = await renderQuestionView(parsed.examId, parsed.trailing[0], student, user, { refreshKeyboard: false });
      }
    } else if (data.startsWith('grid_')) {
      // grid_EXAMID or grid_EXAMID_PAGE (page only if full exam id matched)
      const rest = data.slice(5);
      const parsed = resolveExamIdFromRest(rest, 0);
      if (parsed) {
        // trailing[0] = page when present; undefined → open page of current question
        const page = parsed.trailing.length ? parsed.trailing[0] : undefined;
        response = await renderQuestionGrid(parsed.examId, student, user, page);
      }
    } else if (data.startsWith('revatt_')) {
      // revatt_ATTEMPTID_sum | revatt_ATTEMPTID_PAGE
      const rest = data.slice(7);
      let attemptId = '';
      let pagePart = '';
      const lastUnderscore = rest.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        attemptId = rest.slice(0, lastUnderscore);
        pagePart = rest.slice(lastUnderscore + 1);
      }
      const att = store.getAttempts().find((a) => a.id === attemptId);
      const exam = att ? store.getExamById(att.examId) : undefined;
      if (att && exam && (att.telegramUserId === student.telegramUserId || att.studentId === student.studentId)) {
        if (!att.answers || Object.keys(att.answers).length === 0) {
          try {
            await store.loadAttemptAnswers(att.id);
          } catch (e: any) {
            console.error('[telegram] loadAttemptAnswers:', e?.message || e);
          }
        }
        const loaded = store.getAttempts().find((a) => a.id === attemptId) || att;
        if (pagePart === 'sum') {
          response = renderAttemptSummary(exam, loaded, null);
        } else {
          response = renderAttemptSummary(exam, loaded, parseInt(pagePart, 10) || 0);
        }
      } else {
        response = {
          chatId: user.id,
          text: '❌ Result not found.',
          replyMarkup: {
            inline_keyboard: [[{ text: '📊 My Results', callback_data: 'btn_results' }]],
          },
          type: 'editMessageText',
        };
      }
    } else if (data.startsWith('rev_')) {
      // rev_EXAMID_sum | rev_EXAMID_PAGE
      const rest = data.slice(4);
      let examId = '';
      let pagePart = '';
      const examsSorted = store.getExams().map((e) => e.id).sort((a, b) => b.length - a.length);
      for (const id of examsSorted) {
        if (rest === id + '_sum' || rest.startsWith(id + '_')) {
          examId = id;
          pagePart = rest.slice(id.length + 1);
          break;
        }
      }
      if (!examId) {
        const lastUnderscore = rest.lastIndexOf('_');
        if (lastUnderscore !== -1) {
          examId = rest.slice(0, lastUnderscore);
          pagePart = rest.slice(lastUnderscore + 1);
        }
      }
      if (examId) {
        const exam = store.getExamById(examId);
        const mine = store.getStudentAttempts(examId, student.telegramUserId!).filter(
          (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'
        );
        let attempt =
          mine.find((a) => a.isOfficial !== false) ||
          mine[mine.length - 1] ||
          (exam ? store.getAttempt(examId, student.telegramUserId!) : undefined);
        if (exam && attempt) {
          // Answers are often not in memory (loaded on demand) — required for review
          if (!attempt.answers || Object.keys(attempt.answers).length === 0) {
            try {
              await store.loadAttemptAnswers(attempt.id);
              attempt = store.getAttempts().find((a) => a.id === attempt!.id) || attempt;
            } catch (e: any) {
              console.error('[telegram] loadAttemptAnswers failed:', e?.message || e);
            }
          }
          if (pagePart === 'sum') {
            response = renderAttemptSummary(exam, attempt, null);
          } else {
            response = renderAttemptSummary(exam, attempt, parseInt(pagePart, 10) || 0);
          }
        } else {
          response = {
            chatId: user.id,
            text: '❌ Could not find that exam result. Open *My Results* and try again.',
            replyMarkup: {
              inline_keyboard: [
                [{ text: '📊 My Results', callback_data: 'btn_results' }],
                [{ text: '🏠 Main menu', callback_data: 'btn_home' }],
              ],
            },
            type: 'editMessageText',
          };
        }
      }
    } else if (data.startsWith('confirm_submit_')) {
      const examId = data.replace('confirm_submit_', '');
      response = renderSubmitConfirmation(examId, student, user);
    } else if (data.startsWith('do_submit_')) {
      const examId = data.replace('do_submit_', '');
      response = await handleFinalSubmit(examId, student, user);
    }

    // Keep single-chat edits for pure inline (MCQ). ReplyKeyboard / remove needs sendMessage.
    const needsSendKb = Boolean(response?.replyKeyboard);
    if (response && cbMessageId && !needsSendKb) {
      response.messageId = cbMessageId;
      response.type = 'editMessageText';
    } else if (response && needsSendKb) {
      response.type = 'sendMessage';
      delete (response as any).messageId;
    }
    return response;
  }

  // Handle incoming text commands
  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text.trim();
    const user = msg.from;
    const student = await getOrCreateStudent(user);

    // Name from "Set your name" button — next plain text is the name
    if (pendingNameUsers.has(user.id) && !text.startsWith('/')) {
      const newName = text.trim().slice(0, 60);
      if (newName.length < 2) {
        return {
          chatId: user.id,
          text: `✏️ Name is too short. Please send your full name (at least 2 characters).`,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 Main menu', callback_data: 'btn_home' }]]
          },
          type: 'sendMessage'
        };
      }
      pendingNameUsers.delete(user.id);
      student.name = newName;
      store.saveStudent(student);
      return {
        chatId: user.id,
        text: `✅ *Name updated!*\n\nYour name is now: *${newName}*\n\nThis will appear on results and the leaderboard.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
            [{ text: '🏠 Main menu', callback_data: 'btn_home' }]
          ]
        },
        type: 'sendMessage'
      };
    }



    // ReplyKeyboard navigation (all non-MCQ actions)
    {
      const resolved = resolveReplyAction(user.id, text);
      if (resolved && !pendingNameUsers.has(user.id)) {
        const sess = getKbSession(user.id);
        const action = resolved.action;
        const arg = resolved.arg;

        // Picked numbered item from list
        if (action === 'pick' && arg) {
          if (arg.startsWith('exam:')) {
            const examId = arg.slice(5);
            if (sess?.screen === 'lb_pick') {
              return { ...renderExamLeaderboard(examId, student, false), type: 'sendMessage' };
            }
            return { ...renderExamOptions(examId, student), type: 'sendMessage' };
          }
          if (arg.startsWith('att:')) {
            const attemptId = arg.slice(4);
            const att = store.getAttempts().find((a) => a.id === attemptId);
            const exam = att ? store.getExamById(att.examId) : undefined;
            if (att && exam) {
              if (!att.answers || Object.keys(att.answers).length === 0) {
                try { await store.loadAttemptAnswers(att.id); } catch {}
              }
              const loaded = store.getAttempts().find((a) => a.id === attemptId) || att;
              return { ...renderAttemptSummary(exam, loaded, null), type: 'sendMessage' };
            }
          }
          if (arg.startsWith('q:') && sess?.examId) {
            const qIdx = parseInt(arg.slice(2), 10) || 0;
            return await renderQuestionView(sess.examId, qIdx, student, user, { refreshKeyboard: false });
          }
        }

        if (action === 'exams' || action === 'back_exams') {
          return { ...renderExamsList(student), type: 'sendMessage' };
        }
        if (action === 'results') {
          return { ...renderStudentResults(student), type: 'sendMessage' };
        }
        if (action === 'leaderboard' || action === 'lb_pick') {
          return { ...renderLeaderboardExamPicker(student), type: 'sendMessage' };
        }
        if (action === 'home') {
          return renderMainMenu(student);
        }
        if (action === 'setName') {
          pendingNameUsers.add(user.id);
          return {
            chatId: user.id,
            text: `✏️ *Set my name*\n\nPlease type your full name and send it as a message.`,
            replyKeyboard: mainNavReplyKeyboard(),
            type: 'sendMessage',
          };
        }
        if (action === 'start_exam' && sess?.examId) {
          return await handleStartOrResumeExam(sess.examId, student, user, false);
        }
        if (action === 'resume_exam' && sess?.examId) {
          return await handleStartOrResumeExam(sess.examId, student, user, false);
        }
        if (action === 'view_result' && sess?.attemptId) {
          const att = store.getAttempts().find((a) => a.id === sess.attemptId);
          const exam = att ? store.getExamById(att.examId) : sess.examId ? store.getExamById(sess.examId) : undefined;
          if (att && exam) {
            if (!att.answers || Object.keys(att.answers).length === 0) {
              try { await store.loadAttemptAnswers(att.id); } catch {}
            }
            const loaded = store.getAttempts().find((a) => a.id === att.id) || att;
            return { ...renderAttemptSummary(exam, loaded, null), type: 'sendMessage' };
          }
        }
        if (action === 'reattempt' && sess?.examId) {
          return await handleStartOrResumeExam(sess.examId, student, user, true);
        }
        if (action === 'exam_lb' && sess?.examId) {
          return { ...renderExamLeaderboard(sess.examId, student, false), type: 'sendMessage' };
        }
        if (action === 'lb_more' && sess?.examId) {
          return { ...renderExamLeaderboard(sess.examId, student, true), type: 'sendMessage' };
        }
        if (action === 'review' && sess?.attemptId) {
          const att = store.getAttempts().find((a) => a.id === sess.attemptId);
          const exam = att ? store.getExamById(att.examId) : undefined;
          if (att && exam) {
            if (!att.answers || Object.keys(att.answers).length === 0) {
              try { await store.loadAttemptAnswers(att.id); } catch {}
            }
            const loaded = store.getAttempts().find((a) => a.id === att.id) || att;
            return { ...renderAttemptSummary(exam, loaded, 0), type: 'sendMessage' };
          }
        }
        if (action === 'score_sum' && sess?.attemptId) {
          const att = store.getAttempts().find((a) => a.id === sess.attemptId);
          const exam = att ? store.getExamById(att.examId) : undefined;
          if (att && exam) {
            return { ...renderAttemptSummary(exam, att, null), type: 'sendMessage' };
          }
        }
        if ((action === 'prev' || action === 'next') && sess) {
          if (sess.screen === 'review' && sess.attemptId) {
            const page = (sess.reviewPage || 0) + (action === 'next' ? 1 : -1);
            const att = store.getAttempts().find((a) => a.id === sess.attemptId);
            const exam = att ? store.getExamById(att.examId) : undefined;
            if (att && exam) {
              return { ...renderAttemptSummary(exam, att, Math.max(0, page)), type: 'sendMessage' };
            }
          }
          if (sess.screen === 'in_exam' && sess.examId && sess.qIdx != null) {
            const qIdx = sess.qIdx + (action === 'next' ? 1 : -1);
            // Keep bottom keyboard as-is — only update question + MCQ options
            return await renderQuestionView(sess.examId, Math.max(0, qIdx), student, user, {
              refreshKeyboard: false,
            });
          }
        }
        if ((action === 'prev_page' || action === 'next_page') && sess?.examId) {
          const page = (sess.gridPage || 0) + (action === 'next_page' ? 1 : -1);
          return await renderQuestionGrid(sess.examId, student, user, Math.max(0, page));
        }
        if (action === 'grid' && sess?.examId) {
          return await renderQuestionGrid(sess.examId, student, user);
        }
        if (action === 'submit' && sess?.examId) {
          return renderSubmitConfirmation(sess.examId, student, user);
        }
        if (action === 'do_submit' && sess?.examId) {
          // Show submitting text immediately (text-button path has no callback loading)
          try {
            const token = process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken;
            const mid = sess.lastMessageId;
            if (token && mid) {
              await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: user.id,
                  message_id: mid,
                  text: '⏳ *Submitting exam…*\n\nPlease wait while we score your answers.',
                  parse_mode: 'Markdown',
                }),
                signal: AbortSignal.timeout(5000),
              });
            }
          } catch { /* ignore */ }
          return await handleFinalSubmit(sess.examId, student, user);
        }
        if (action === 'continue_ans' && sess?.examId) {
          const qIdx = sess.qIdx || 0;
          return await renderQuestionView(sess.examId, qIdx, student, user, {
            refreshKeyboard: false,
          });
        }
      }
    }

    // /setname command (still supported)
    if (text.startsWith('/setname')) {
      const newName = text.replace('/setname', '').trim().slice(0, 60);
      if (newName) {
        pendingNameUsers.delete(user.id);
        student.name = newName;
        store.saveStudent(student);
        return {
          chatId: user.id,
          text: `✅ *Name updated!*\n\nYour name is now: *${newName}*`,
          replyKeyboard: mainNavReplyKeyboard(),
          type: 'sendMessage'
        };
      }
      pendingNameUsers.add(user.id);
      return {
        chatId: user.id,
        text: `✏️ *Set your name*\n\nPlease type your full name and send it as a message.`,
        replyMarkup: {
          inline_keyboard: [[{ text: '🏠 Main menu', callback_data: 'btn_home' }]]
        },
        type: 'sendMessage'
      };
    }

    // Standard /start command
    if (text.startsWith('/start')) {
      const parts = text.trim().split(/\s+/);
      const payload = parts[1] || '';

      // Deep link: /start exam_<examId>
      if (payload.startsWith('exam_')) {
        const examId = payload.slice(5);
        return await handleStartOrResumeExam(examId, student, user);
      }

      if (needsNameSetup(student)) {
        pendingNameUsers.add(user.id);
        return {
          chatId: user.id,
          text:
            `👋 *Welcome to Quiz Bot by Pusparghya!*

` +
            `✏️ *Set my name* (one-time setup)

` +
            `Please type your full name and send it as a message.
` +
            `This name appears on results and the leaderboard.`,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 Main menu', callback_data: 'btn_home' }]],
          },
          type: 'sendMessage',
        };
      }

      const menu = renderMainMenu(student);
      return { ...menu, type: 'sendMessage', chatId: user.id };
    }

    if (text === '/exams') {
      return renderExamsList(student);
    }

    if (text === '/results') {
      return renderStudentResults(student);
    }

    if (text === '/leaderboard') {
      return renderStudentLeaderboard(student, false);
    }
  }

  return null;
}

function renderUnlinkedMsg(chatId: number): SimulatorResponse {
  return {
    chatId,
    text: `⚠️ *Account Unlinked*\n\nPlease link your student account using \`/link <LINK_CODE>\` first.`,
    type: 'sendMessage'
  };
}

function renderExamsList(student: Student): SimulatorResponse {
  const myAttempts = store.getAttempts().filter(
    (a) => a.telegramUserId === student.telegramUserId || a.studentId === student.studentId
  );
  const examIds = [...new Set(myAttempts.map((a) => a.examId))];
  const exams = examIds.map((id) => store.getExamById(id)).filter(Boolean) as Exam[];

  if (exams.length === 0) {
    if (student.telegramUserId) setKbSession(student.telegramUserId, { screen: 'exams' });
    return {
      chatId: student.telegramUserId!,
      text:
        `📚 *My Exams*

` +
        `You have no exams yet.

` +
        `Ask your teacher for the *exam link*. Opening that link starts the exam.`,
      replyKeyboard: kbMarkup([...mainNavRows(), [LABELS.home]]),
      type: 'sendMessage',
    };
  }

  const { rows, labels } = numberedListRows(
    exams.map((e) => e.title),
    [[LABELS.home]]
  );
  // Map index → examId via session
  const indexToId: Record<string, string> = {};
  exams.forEach((e, i) => {
    indexToId[String(i)] = e.id;
  });
  // Store labels pointing to exam ids
  const labelToExam: Record<string, string> = {};
  for (const [lab, idx] of Object.entries(labels)) {
    labelToExam[lab] = indexToId[idx];
  }

  if (student.telegramUserId) {
    setKbSession(student.telegramUserId, {
      screen: 'exams',
      examIds: exams.map((e) => e.id),
      labels: Object.fromEntries(Object.entries(labelToExam).map(([k, v]) => [k, `exam:${v}`])),
    });
  }

  let text = `📚 *My Exams*

_Tap an exam below to open options._

`;
  exams.forEach((exam, idx) => {
    text += `*${idx + 1}. ${escapeMd(exam.title)}*
`;
  });

  return {
    chatId: student.telegramUserId!,
    text,
    replyKeyboard: kbMarkup(rows),
    type: 'sendMessage',
  };
}

function renderExamOptions(examId: string, student: Student): SimulatorResponse {
  const exam = store.getExamById(examId);
  if (!exam) {
    return {
      chatId: student.telegramUserId!,
      text: '❌ Exam not found.',
      replyKeyboard: mainNavReplyKeyboard(),
      type: 'sendMessage',
    };
  }

  const attempts = store.getStudentAttempts(exam.id, student.telegramUserId!);
  const active = attempts.find((a) => a.status === 'IN_PROGRESS');
  const submitted = attempts
    .filter((a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
    .slice()
    .sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    });
  const officialDone = submitted.find((a) => a.isOfficial !== false);
  const anyDone = submitted.length > 0;
  const locked = Date.now() < new Date(exam.startDate).getTime();
  const latest = officialDone || submitted[0];

  let text = `👁 *${escapeMd(exam.title)}*

`;
  text += `${escapeMd(exam.subject || '')} · ${exam.totalQuestions || exam.questions?.length || 0} Qs · ${exam.durationMinutes} min

`;
  text += `_Choose an option from the buttons below._`;

  const rows: string[][] = [];
  if (locked) {
    text += `

🔒 Locked until ${formatInIST(new Date(exam.startDate))}`;
  } else if (active) {
    rows.push([LABELS.continueExam]);
  } else if (!anyDone) {
    rows.push([LABELS.startExam]);
  }
  if (anyDone) {
    rows.push([LABELS.viewResult]);
    rows.push([LABELS.reattempt]);
  }
  rows.push([LABELS.examLb]);
  rows.push([LABELS.backExams]);
  rows.push([LABELS.home]);

  if (student.telegramUserId) {
    setKbSession(student.telegramUserId, {
      screen: 'exam_opts',
      examId: exam.id,
      attemptId: latest?.id,
    });
  }

  return {
    chatId: student.telegramUserId!,
    text,
    replyKeyboard: kbMarkup(rows),
    type: 'sendMessage',
  };
}

async function handleStartOrResumeExam(examId: string, student: Student, user: TelegramUser, forceNew = false): Promise<SimulatorResponse> {
  const now = new Date();
  const exam = store.getExamById(examId);

  if (!exam) {
    return {
      chatId: user.id,
      text: `❌ *Exam not found*\n\nAsk your teacher for a valid exam link.`,
      type: 'sendMessage'
    };
  }

  // Status is automatic from schedule — no manual DRAFT gate

  // Require a valid teacher-owned exam (blocks orphaned / unauthorized exams)
  if (!exam.teacherId) {
    return {
      chatId: user.id,
      text: `❌ This exam is not available.`,
      type: 'sendMessage'
    };
  }

  const startDate = new Date(exam.startDate);
  if (now < startDate) {
    return {
      chatId: user.id,
      text: `🔒 *Exam locked until start time*\n\n` +
        `📝 *${exam.title}*\n` +
        `📅 Starts: ${formatInIST(startDate)}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🔄 Check again', callback_data: `start_exam_${exam.id}` }],
          [{ text: '🏠 Main menu', callback_data: 'btn_home' }]
        ]
      },
      type: 'sendMessage'
    };
  }

  // Enroll only when student is allowed past the lock checks (authorized access)
  await linkStudentToTeacher(student, exam.teacherId);

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  const allMine = store.getStudentAttempts(examId, student.telegramUserId!);
  const officialExists = allMine.some(a => a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'));

  // Viewing previous result (not forcing reattempt)
  if (!forceNew && attempt && (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED')) {
    return renderAttemptSummary(exam, attempt);
  }

  // Resume in-progress
  if (!forceNew && attempt && attempt.status === 'IN_PROGRESS') {
    if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
      return await autoSubmitExam(exam, attempt);
    }
    return await renderQuestionView(exam.id, attempt.currentQuestionIndex, student, user, { refreshKeyboard: true });
  }

  // Start new attempt (first or reattempt) — SQL-backed number for multi-instance safety
  const attemptNumber = await store.nextAttemptNumber(examId, student.telegramUserId!);
  const windowOpen = isExamWindowOpen(exam, now.getTime());
  // Official ONLY inside [start, start+duration) and no prior official attempt
  const isOfficial = windowOpen && !officialExists;
  if (!windowOpen && !officialExists && !forceNew) {
    // First visit after window closed — allow practice, explain
  }
  const startedAt = now.toISOString();
  const { end: windowEnd } = getExamWindow(exam);
  let expiresMs = now.getTime() + Math.max(1, exam.durationMinutes || 60) * 60 * 1000;
  // Official attempt cannot run past the global exam window end
  if (isOfficial) {
    expiresMs = Math.min(expiresMs, windowEnd);
  }
  const expiresAt = new Date(expiresMs).toISOString();

  attempt = {
    id: `ATT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    examId,
    studentId: student.studentId,
    telegramUserId: student.telegramUserId!,
    studentName: student.name,
    studentClass: student.className,
    startedAt,
    expiresAt,
    submittedAt: null,
    status: 'IN_PROGRESS',
    answers: {},
    currentQuestionIndex: 0,
    score: 0,
    maxScore: exam.totalMarks,
    percentage: 0,
    correctCount: 0,
    wrongCount: 0,
    skippedCount: exam.totalQuestions,
    timeTakenSeconds: 0,
    isOfficial,
    attemptNumber
  };

  store.saveAttempt(attempt);
  store.addAuditLog('EXAM_STARTED', `${student.name} started ${exam.title} (attempt #${attemptNumber}, official=${isOfficial})`);

  // Practice / new attempt: set bottom exam keyboard once
  return await renderQuestionView(exam.id, 0, student, user, { refreshKeyboard: true });
}

async function handleOptionSelect(examId: string, qIdx: number, optIdx: number, student: Student, user: TelegramUser): Promise<SimulatorResponse> {
  const now = new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found. Please type /exams to see available tests.', type: 'sendMessage' };
  }

  // Enroll only when student is allowed past the lock checks (authorized access)
  await linkStudentToTeacher(student, exam.teacherId);

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    const startRes = await handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) {
      return startRes;
    }
  }

  // Check expiration
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return await autoSubmitExam(exam, attempt);
  }

  if (attempt.status !== 'IN_PROGRESS') {
    return renderAttemptSummary(exam, attempt);
  }

  const question = exam.questions[qIdx];
  if (question) {
    if (!attempt.answers) attempt.answers = {};
    attempt.answers[question.id] = optIdx;
    attempt.currentQuestionIndex = qIdx;
    // Idempotent single-answer UPSERT (no full rewrite race)
    void store.saveAnswer(attempt.id, question.id, optIdx, qIdx).catch((e) =>
      console.error('[bot] saveAnswer failed', e?.message || e)
    );
  }

  return await renderQuestionView(examId, qIdx, student, user, { refreshKeyboard: false });
}

async function renderQuestionView(
  examId: string,
  qIdx: number,
  student: Student,
  user: TelegramUser,
  opts: { refreshKeyboard?: boolean } = {}
): Promise<SimulatorResponse> {
  const now = new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return {
      chatId: user.id,
      text: '❌ Examination not found. Please type /exams to see available tests.',
      type: 'sendMessage',
    };
  }

  await linkStudentToTeacher(student, exam.teacherId);

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    const startRes = await handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) return startRes;
  }

  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return await autoSubmitExam(exam, attempt);
  }

  attempt.currentQuestionIndex = qIdx;

  const total = exam.questions.length;
  const question = exam.questions[qIdx];
  const selectedOpt = attempt.answers?.[question.id];
  const remaining = formatRemaining(attempt.expiresAt);

  // Full option text in the message; letter-only buttons below
  let text = `📝 *${escapeMd(exam.title)}*
`;
  text += `⏱️ *${remaining}* left · Q${qIdx + 1}/${total}

`;
  text += `${escapeMd(question.question || '')}

`;

  const optsList = question.options || [];
  optsList.forEach((optText, oIdx) => {
    const letter = String.fromCharCode(65 + oIdx);
    const isSelected = selectedOpt === oIdx;
    const mark = isSelected ? '🔘' : '⚪';
    text += `${mark} *${letter}.* ${escapeMd(String(optText || ''))}
`;
  });
  if (selectedOpt !== undefined && selectedOpt !== null) {
    text += `
_Selected: ${String.fromCharCode(65 + Number(selectedOpt))}_`;
  }

  // Buttons: A B C D only (full text is above)
  const keyboard: InlineKeyboardButton[][] = [];
  let letterRow: InlineKeyboardButton[] = [];
  optsList.forEach((_optText, oIdx) => {
    const letter = String.fromCharCode(65 + oIdx);
    const isSelected = selectedOpt === oIdx;
    letterRow.push({
      text: isSelected ? `● ${letter}` : letter,
      callback_data: `ans_${exam.id}_${qIdx}_${oIdx}`,
    });
    if (letterRow.length === 4 || oIdx === optsList.length - 1) {
      keyboard.push(letterRow);
      letterRow = [];
    }
  });

  const navRow: InlineKeyboardButton[] = [];
  if (qIdx > 0) {
    navRow.push({ text: '◀ Previous', callback_data: `nav_${exam.id}_${qIdx - 1}` });
  }
  if (qIdx < total - 1) {
    navRow.push({ text: 'Next ▶', callback_data: `nav_${exam.id}_${qIdx + 1}` });
  }
  if (navRow.length) keyboard.push(navRow);

  keyboard.push([
    { text: '📋 Question Grid', callback_data: `grid_${exam.id}` },
    { text: '✅ Submit Exam', callback_data: `confirm_submit_${exam.id}` },
  ]);
  // No Main menu under exam message (per product request)

  const prevSess = getKbSession(user.id);
  setKbSession(user.id, {
    screen: 'in_exam',
    examId: exam.id,
    qIdx,
    lastMessageId: prevSess?.lastMessageId,
  });

  const messageId = prevSess?.lastMessageId;
  // Prefer edit-in-place when we have a prior message id (inline only)
  if (messageId && opts.refreshKeyboard !== true) {
    return {
      chatId: user.id,
      text,
      replyMarkup: { inline_keyboard: keyboard },
      messageId,
      type: 'editMessageText',
    };
  }
  // Entering exam: replace sticky exam-options bar with a single Main menu key
  // (full remove_keyboard makes the phone typing keyboard pop up).
  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    replyKeyboard: kbMarkup([[LABELS.home]]),
    type: 'sendMessage',
  };
}

async function renderQuestionGrid(
  examId: string,
  student: Student,
  user: TelegramUser,
  page?: number
): Promise<SimulatorResponse> {
  const exam = store.getExamById(examId);
  if (!exam) {
    return {
      chatId: user.id,
      text: '❌ Examination not found.',
      replyKeyboard: mainNavReplyKeyboard(),
      type: 'sendMessage',
    };
  }

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    await handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) {
      return { chatId: user.id, text: '❌ Exam session missing.', type: 'sendMessage' };
    }
  }

  const answeredCount = Object.keys(attempt.answers || {}).length;
  const total = exam.questions.length;
  const remaining = formatRemaining(attempt.expiresAt);
  const sessForQ = getKbSession(user.id);
  const fromSess = sessForQ?.examId === examId && sessForQ.qIdx != null ? sessForQ.qIdx : undefined;
  const currentIdx = Math.max(
    0,
    Math.min(fromSess ?? attempt.currentQuestionIndex ?? 0, total - 1)
  );
  const PER = 20;
  const totalPages = Math.max(1, Math.ceil(total / PER));
  // Open page containing the current question unless page is forced
  const p = Math.max(
    0,
    Math.min(page != null && page !== undefined ? page : Math.floor(currentIdx / PER), totalPages - 1)
  );
  const startIdx = p * PER;
  const endIdx = Math.min(startIdx + PER, total);

  let text = `📋 *Question Grid*
`;
  text += `📝 *${escapeMd(exam.title)}*
`;
  text += `⏱️ *${remaining}* left · 🟢 ${answeredCount}/${total}
`;
  text += `📄 Page ${p + 1}/${totalPages} · Now on *Q${currentIdx + 1}*

`;
  text += `_Tap a number to jump:_`;

  // Inline grid on the same bot message (edit-in-place, no chat spam)
  const keyboard: InlineKeyboardButton[][] = [];
  let row: InlineKeyboardButton[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    const q = exam.questions[i];
    const answered = attempt.answers && attempt.answers[q.id] !== undefined;
    const isCurrent = i === currentIdx;
    let label = isCurrent ? `👉${i + 1}` : answered ? `✅${i + 1}` : `${i + 1}`;
    row.push({ text: label.slice(0, 64), callback_data: `nav_${exam.id}_${i}` });
    if (row.length === 5) {
      keyboard.push(row);
      row = [];
    }
  }
  if (row.length) keyboard.push(row);

  const pageNav: InlineKeyboardButton[] = [];
  if (p > 0) pageNav.push({ text: '◀ Prev page', callback_data: `grid_${exam.id}_${p - 1}` });
  if (p < totalPages - 1) pageNav.push({ text: 'Next page ▶', callback_data: `grid_${exam.id}_${p + 1}` });
  if (pageNav.length) keyboard.push(pageNav);
  // Back to current question
  keyboard.push([
    { text: '🔙 Back to question', callback_data: `nav_${exam.id}_${currentIdx}` },
    { text: '✅ Submit Exam', callback_data: `confirm_submit_${exam.id}` },
  ]);

  const sess = getKbSession(user.id);
  setKbSession(user.id, {
    screen: 'grid',
    examId: exam.id,
    gridPage: p,
    qIdx: currentIdx,
    lastMessageId: sess?.lastMessageId,
  });

  const messageId = sess?.lastMessageId;
  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    messageId,
    type: messageId ? 'editMessageText' : 'sendMessage',
  };
}

function renderSubmitConfirmation(examId: string, student: Student, user: TelegramUser): SimulatorResponse {
  const exam = store.getExamById(examId);
  const attempt = store.getAttempt(examId, student.telegramUserId!);

  if (!exam || !attempt) {
    return { chatId: user.id, text: '❌ Exam session missing.', type: 'sendMessage' };
  }

  const answeredCount = Object.keys(attempt.answers || {}).length;
  const total = exam.questions.length;
  const unansweredCount = total - answeredCount;
  const remaining = formatRemaining(attempt.expiresAt);

  let text = `⚠️ *Confirm Submission*\n\n`;
  text += `📝 *${escapeMd(exam.title)}*\n`;
  text += `⏱️ Time Remaining: *${remaining}*\n\n`;
  text += `🟢 Answered: *${answeredCount}*\n`;
  text += `⚪ Unanswered: *${unansweredCount}*\n\n`;
  text += `Submit your examination now?`;

  setKbSession(user.id, {
    screen: 'submit_confirm',
    examId: exam.id,
    qIdx: attempt.currentQuestionIndex || 0,
  });

  const sess = getKbSession(user.id);
  const messageId = sess?.lastMessageId;
  return {
    chatId: user.id,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🚀 Yes, Submit Exam Now', callback_data: `do_submit_${exam.id}` }],
        [{ text: '🔙 Continue Answering', callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex || 0}` }],
      ],
    },
    messageId,
    type: messageId ? 'editMessageText' : 'sendMessage',
  };
}

async function handleFinalSubmit(examId: string, student: Student, user: TelegramUser): Promise<SimulatorResponse> {
  const now = new Date();
  const exam = store.getExamById(examId);
  const attempt = store.getAttempt(examId, student.telegramUserId!);

  if (!exam || !attempt) {
    return { chatId: user.id, text: '❌ Exam session missing.', type: 'sendMessage' };
  }

  if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
    return renderAttemptSummary(exam, attempt);
  }

  const startMs = new Date(attempt.startedAt).getTime();
  const timeTakenSecs = Math.max(1, Math.floor((now.getTime() - startMs) / 1000));

  const stats = calculateAttemptScore(exam, attempt.answers, timeTakenSecs);

  attempt.status = 'SUBMITTED';
  attempt.submittedAt = now.toISOString();
  attempt.score = stats.score;
  attempt.maxScore = stats.maxScore;
  attempt.percentage = stats.percentage;
  attempt.correctCount = stats.correctCount;
  attempt.wrongCount = stats.wrongCount;
  attempt.skippedCount = stats.skippedCount;
  attempt.timeTakenSeconds = stats.timeTakenSeconds;

  const saved = await store.submitAttemptIfInProgress(attempt);
  if (!saved) {
    // Already submitted (duplicate callback) — return existing summary
    const existing = store.getAttempt(examId, student.telegramUserId!);
    if (existing) return renderAttemptSummary(exam, existing);
  }
  await updateExamRanks(exam.id);
  store.addAuditLog('EXAM_SUBMITTED', `Student ${student.name} (${student.studentId}) submitted ${exam.title} with score ${attempt.score}/${attempt.maxScore}`);

  return renderAttemptSummary(exam, attempt);
}

async function autoSubmitExam(exam: Exam, attempt: Attempt): Promise<SimulatorResponse> {
  const now = new Date();
  const startMs = new Date(attempt.startedAt).getTime();
  const timeTakenSecs = Math.floor((new Date(attempt.expiresAt).getTime() - startMs) / 1000);

  const stats = calculateAttemptScore(exam, attempt.answers, timeTakenSecs);

  attempt.status = 'AUTO_SUBMITTED';
  attempt.submittedAt = now.toISOString();
  attempt.score = stats.score;
  attempt.maxScore = stats.maxScore;
  attempt.percentage = stats.percentage;
  attempt.correctCount = stats.correctCount;
  attempt.wrongCount = stats.wrongCount;
  attempt.skippedCount = stats.skippedCount;
  attempt.timeTakenSeconds = stats.timeTakenSeconds;

  await store.submitAttemptIfInProgress(attempt);
  await updateExamRanks(exam.id);
  store.addAuditLog('EXAM_AUTO_SUBMITTED', `Exam ${exam.title} auto-submitted for ${attempt.studentName} due to time expiration`);

  return renderAttemptSummary(exam, attempt);
}

function renderAttemptSummary(exam: Exam, attempt: Attempt, reviewPage: number | null = null): SimulatorResponse {
  const chatId = attempt.telegramUserId;
  const keyboard: InlineKeyboardButton[][] = [];
  const totalQ = exam.questions?.length || 0;
  const PER_PAGE = 8;
  const totalPages = Math.max(1, Math.ceil(totalQ / PER_PAGE));
  let text = '';

  if (exam.resultVisibility === 'PUBLISHED') {
    if (reviewPage === null || reviewPage === undefined) {
      // Full summary once
      text = `🎉 *Exam submitted*\n\n`;
      text += `📝 *${escapeMd(exam.title)}*\n`;
      text += `👤 *${escapeMd(attempt.studentName || '')}*\n`;
      if (attempt.attemptNumber && attempt.attemptNumber > 1) {
        text += `🔁 Practice attempt #${attempt.attemptNumber} (not ranked)\n`;
      }
      text += `📌 ${attempt.status === 'AUTO_SUBMITTED' ? '⏰ Auto-submitted (time up)' : '✅ Submitted'}\n\n`;
      text += `📊 *Your score*\n`;
      text += `⭐ ${attempt.score} / ${attempt.maxScore} (${attempt.percentage}%)\n`;
      text += `✅ ${attempt.correctCount}  ❌ ${attempt.wrongCount}  ⚪ ${attempt.skippedCount}\n`;
      const mins = Math.floor(attempt.timeTakenSeconds / 60);
      const secs = attempt.timeTakenSeconds % 60;
      text += `⏱️ Time: ${mins}m ${secs}s\n`;
      if (attempt.isOfficial !== false && isExamTimeEnded(exam) && attempt.rank) {
        text += `🏆 Rank: #${attempt.rank}\n`;
      } else if (attempt.isOfficial !== false && !isExamTimeEnded(exam)) {
        text += `🏆 Rank after exam ends\n`;
      }
      text += `\n📖 Tap *Review answers* to see each question (page by page).`;
      if (totalQ > 0) {
        keyboard.push([{ text: `📖 Review answers (1/${totalPages})`, callback_data: `revatt_${attempt.id}_0` }]);
      }
    } else {
      // Review: no score summary — more answers per page
      const page = Math.max(0, Math.min(reviewPage, totalPages - 1));
      const startQ = page * PER_PAGE;
      const endQ = Math.min(startQ + PER_PAGE, totalQ);
      text =
        `📖 *Review answers*\n` +
        `📝 ${escapeMd(exam.title)}\n` +
        `*Questions ${startQ + 1}\u2013${endQ} of ${totalQ}* (page ${page + 1}/${totalPages})\n\n`;

      for (let i = startQ; i < endQ; i++) {
        const q = exam.questions[i];
        const sel = attempt.answers?.[q.id];
        const has = sel !== undefined && sel !== null;
        let mark = '⚪';
        let extra = 'Skipped';
        if (has) {
          const ok = q.answer !== null && sel === q.answer;
          mark = ok ? '✅' : '❌';
          const chosen = q.options?.[sel as number] ?? `opt ${sel}`;
          const correct =
            q.answer !== null && q.options?.[q.answer] !== undefined ? q.options[q.answer] : '—';
          const cShort = String(chosen).slice(0, 40);
          const rShort = String(correct).slice(0, 40);
          extra = ok ? `Yours: ${cShort}` : `Yours: ${cShort} · Correct: ${rShort}`;
        }
        const short = escapeMd((q.question || '').slice(0, 55));
        text += `${mark} *Q${i + 1}.* ${short}${ (q.question || '').length > 55 ? '…' : ''}\n   ${escapeMd(extra)}\n`;
      }

      const nav: InlineKeyboardButton[] = [];
      if (page > 0) {
        nav.push({ text: '◀ Previous', callback_data: `revatt_${attempt.id}_${page - 1}` });
      }
      if (page < totalPages - 1) {
        nav.push({ text: 'Next ▶', callback_data: `revatt_${attempt.id}_${page + 1}` });
      }
      if (nav.length) keyboard.push(nav);
      keyboard.push([{ text: '📊 Score summary', callback_data: `revatt_${attempt.id}_sum` }]);
    }
} else {
    text += `🔒 Results are hidden by the teacher for now.\n`;
  }


  const rows: string[][] = [];
  if (reviewPage !== null && reviewPage !== undefined) {
    const totalQ = exam.questions?.length || 0;
    const PER_PAGE = 5;
    const totalPages = Math.max(1, Math.ceil(totalQ / PER_PAGE));
    const page = Math.max(0, Math.min(reviewPage, totalPages - 1));
    const nav: string[] = [];
    if (page > 0) nav.push(LABELS.prev);
    if (page < totalPages - 1) nav.push(LABELS.next);
    if (nav.length) rows.push(nav);
    rows.push([LABELS.scoreSum]);
    rows.push([LABELS.home]);
  } else {
    // My Results → select attempt: only Review / Practice again / Main menu
    if (exam.resultVisibility === 'PUBLISHED' && (exam.questions?.length || 0) > 0) {
      rows.push([LABELS.review]);
    }
    rows.push([LABELS.practiceAgain]);
    rows.push([LABELS.home]);
  }

  if (text.length > 3900) {
    text = text.slice(0, 3890) + '\n…';
  }

  setKbSession(chatId, {
    screen: reviewPage != null ? 'review' : 'result_detail',
    examId: exam.id,
    attemptId: attempt.id,
    reviewPage: reviewPage != null ? reviewPage : undefined,
  });

  return {
    chatId,
    text,
    replyKeyboard: kbMarkup(rows),
    type: 'sendMessage',
  };
}

function renderStudentResults(student: Student): SimulatorResponse {
  const attempts = store
    .getAttempts()
    .filter(
      (a) =>
        (a.telegramUserId === student.telegramUserId || a.studentId === student.studentId) &&
        (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
    )
    .slice()
    .sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    });

  if (attempts.length === 0) {
    return {
      chatId: student.telegramUserId!,
      text: `📊 *My Results*\n\nYou have not submitted any exams yet.\nOpen the link from your teacher to start.`,
      replyMarkup: { inline_keyboard: [[{ text: '📚 My Exams', callback_data: 'btn_exams' }]] },
      type: 'sendMessage',
    };
  }

  // Cap list text length — details open via Review buttons
  const MAX_LIST = 12;
  const shown = attempts.slice(0, MAX_LIST);
  let text = `📊 *My Results — ${escapeMd(student.name)}*\n\n`;
  text += `_Showing ${shown.length} of ${attempts.length}. Tap an exam to open score & answers._\n\n`;

  const keyboard: InlineKeyboardButton[][] = [];
  shown.forEach((att, idx) => {
    const exam = store.getExamById(att.examId);
    const title = exam ? exam.title : att.examId;
    const practice = att.isOfficial === false ? ' (practice)' : '';
    let line = `*${idx + 1}. ${escapeMd(title)}*${practice}\n`;
    if (exam && exam.resultVisibility === 'PUBLISHED') {
      line += `   Score: *${att.score}/${att.maxScore}* (${att.percentage}%)`;
      if (att.isOfficial !== false && isExamTimeEnded(exam) && att.rank) {
        line += ` · Rank #${att.rank}`;
      }
      line += `\n`;
    } else {
      line += `   🔒 Results hidden\n`;
    }
    text += line;
    if (exam && exam.resultVisibility === 'PUBLISHED') {
      const kind = att.isOfficial === false ? 'Practice' : 'Official';
      keyboard.push([
        {
          text: `📖 ${idx + 1}. ${(title || 'Exam').slice(0, 22)} (${kind})`,
          callback_data: `revatt_${att.id}_sum`,
        },
      ]);
    }
  });

  if (text.length > 3500) text = text.slice(0, 3490) + '\n…';


  const titles = shown.map((att) => {
    const exam = store.getExamById(att.examId);
    const kind = att.isOfficial === false ? 'P' : 'O';
    return `${(exam?.title || 'Exam').slice(0, 28)} (${kind})`;
  });
  const numbered = numberedListRows(titles, [
    [LABELS.exams, LABELS.leaderboard],
    [LABELS.home],
  ]);
  const labelMap: Record<string, string> = {};
  for (const [lab, idx] of Object.entries(numbered.labels)) {
    labelMap[lab] = `att:${shown[Number(idx)].id}`;
  }
  if (student.telegramUserId) {
    setKbSession(student.telegramUserId, {
      screen: 'results',
      attemptIds: shown.map((a) => a.id),
      labels: labelMap,
    });
  }

  return {
    chatId: student.telegramUserId!,
    text,
    replyKeyboard: kbMarkup(numbered.rows),
    type: 'sendMessage',
  };
}


function matchesClass(studentClass?: string, examClass?: string): boolean {
  if (!studentClass || !examClass) return true;
  const s = studentClass.trim().toLowerCase();
  const e = examClass.trim().toLowerCase();
  if (s === 'all' || s === 'all students' || e === 'all' || e === 'all students') return true;
  return s === e;
}

function renderLeaderboardExamPicker(student: Student): SimulatorResponse {
  const myExamIds = [
    ...new Set(
      store
        .getAttempts()
        .filter(
          (a) =>
            a.telegramUserId === student.telegramUserId || a.studentId === student.studentId
        )
        .map((a) => a.examId)
    ),
  ];
  const exams = myExamIds
    .map((id) => store.getExamById(id))
    .filter((e): e is Exam => !!e && isExamTimeEnded(e));

  if (exams.length === 0) {
    return {
      chatId: student.telegramUserId!,
      text:
        `🏆 *Leaderboard*\n\n` +
        `Rankings appear only *after an exam ends*.\n` +
        `Official attempts only.`,
      replyMarkup: {
        inline_keyboard: [[{ text: '🏠 Main menu', callback_data: 'btn_home' }]],
      },
      type: 'editMessageText',
    };
  }

  let text = `🏆 *Leaderboard*\n\n_Select an exam to view rankings (official attempts only)._\n\n`;
  const keyboard: InlineKeyboardButton[][] = [];
  exams.forEach((exam, idx) => {
    keyboard.push([
      {
        text: `${idx + 1}. ${(exam.title || 'Exam').slice(0, 40)}`,
        callback_data: `lb_exam_${exam.id}`,
      },
    ]);
  });
  const { rows, labels } = numberedListRows(
    exams.map((e) => e.title),
    [[LABELS.home]]
  );
  const labelMap: Record<string, string> = {};
  for (const [lab, idx] of Object.entries(labels)) {
    labelMap[lab] = `exam:${exams[Number(idx)].id}`;
  }
  if (student.telegramUserId) {
    setKbSession(student.telegramUserId, {
      screen: 'lb_pick',
      examIds: exams.map((e) => e.id),
      labels: labelMap,
    });
  }

  return {
    chatId: student.telegramUserId!,
    text,
    replyKeyboard: kbMarkup(rows),
    type: 'sendMessage',
  };
}

function renderExamLeaderboard(
  examId: string,
  student: Student,
  showAll = false
): SimulatorResponse {
  const exam = store.getExamById(examId);
  if (!exam) {
    return {
      chatId: student.telegramUserId!,
      text: '❌ Exam not found.',
      replyMarkup: {
        inline_keyboard: [[{ text: '🏆 Leaderboard', callback_data: 'btn_leaderboard' }]],
      },
      type: 'editMessageText',
    };
  }

  if (!isExamTimeEnded(exam)) {
    return {
      chatId: student.telegramUserId!,
      text:
        `🏆 *${escapeMd(exam.title)}*\n\n` +
        `Rankings unlock after the exam time ends.`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🏆 Other exams', callback_data: 'btn_leaderboard' }],
          [{ text: '🏠 Main menu', callback_data: 'btn_home' }],
        ],
      },
      type: 'editMessageText',
    };
  }

  const attempts = store
    .getAttempts(exam.id)
    .filter(
      (a) =>
        (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') && a.isOfficial !== false
    )
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
      return 0;
    });

  let text = `🏆 *${escapeMd(exam.title)}*\n_Official attempts only_\n\n`;
  const keyboard: InlineKeyboardButton[][] = [];

  if (attempts.length === 0) {
    text += `_No ranked submissions yet._`;
  } else {
    const limit = showAll ? attempts.length : 10;
    attempts.slice(0, limit).forEach((att, idx) => {
      const rankNum = att.rank || idx + 1;
      const medal =
        rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : `#${rankNum}`;
      const isMe =
        att.telegramUserId === student.telegramUserId || att.studentId === student.studentId
          ? ' *(You)*'
          : '';
      text += `${medal} ${escapeMd(att.studentName)}${isMe} — *${att.score}/${att.maxScore}*\n`;
    });
    if (!showAll && attempts.length > 10) {
      text += `\n_…and ${attempts.length - 10} more_`;
      keyboard.push([{ text: 'Show full ranking', callback_data: `lb_more_${exam.id}` }]);
    }
  }


  const rows: string[][] = [];
  if (!showAll && attempts.length > 10) {
    rows.push([LABELS.showFullLb]);
  }
  rows.push([LABELS.otherLb]);
  rows.push([LABELS.exams, LABELS.home]);

  if (text.length > 3900) text = text.slice(0, 3890) + '\n…';

  if (student.telegramUserId) {
    setKbSession(student.telegramUserId, {
      screen: 'lb_exam',
      examId: exam.id,
    });
  }

  return {
    chatId: student.telegramUserId!,
    text,
    replyKeyboard: kbMarkup(rows),
    type: 'sendMessage',
  };
}


/** @deprecated — kept for any legacy callback; redirects to picker */
function renderStudentLeaderboard(student: Student, _showAll = false): SimulatorResponse {
  return renderLeaderboardExamPicker(student);
}

export async function sendTelegramResponse(resp: SimulatorResponse): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken;
  if (!token) return;

  const hasReplyKb = Boolean(resp.replyKeyboard);
  const hasInline = Boolean(resp.replyMarkup && (resp.replyMarkup as any).inline_keyboard);
  const chatId = resp.chatId;

  const rememberId = (ids?: number[]) => {
    const mid = ids && ids.length ? ids[ids.length - 1] : undefined;
    if (mid == null) return;
    const sess = getKbSession(chatId);
    if (sess) setKbSession(chatId, { ...sess, lastMessageId: mid });
    else setKbSession(chatId, { screen: 'main', lastMessageId: mid });
  };

  /**
   * ReplyKeyboard is chat-level (persists). InlineKeyboard is per-message.
   * When both needed: one sendMessage with ReplyKeyboard + text, then edit same
   * message for InlineKeyboard — one bubble, no "." / notice spam.
   */
  /**
   * Telegram allows only ONE reply_markup per message.
   * Never send the question text twice (that caused duplicate Q1 bubbles).
   * Pattern: optional silent carrier for bottom ReplyKeyboard (deleted),
   * then a SINGLE sendMessage with the question + inline A–D / nav.
   */
  if (hasReplyKb && hasInline) {
    try {
      const r0 = await sendSafeTelegramMessage(token, chatId, '⁠', {
        replyKeyboard: resp.replyKeyboard,
      });
      const carrierId = r0.messageIds?.[0];
      if (carrierId) {
        await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: carrierId }),
          signal: AbortSignal.timeout(4000),
        }).catch(() => {});
      }
    } catch {
      /* keyboard apply is best-effort */
    }

    let r1 = await sendSafeTelegramMessage(token, chatId, resp.text || '', {
      parseMode: 'Markdown',
      replyMarkup: resp.replyMarkup,
    });
    if (!r1.ok) {
      r1 = await sendSafeTelegramMessage(token, chatId, resp.text || '', {
        replyMarkup: resp.replyMarkup,
      });
    }
    if (!r1.ok) {
      console.warn('[Telegram] question+options send failed:', r1.error);
      return;
    }
    rememberId(r1.messageIds);
    return;
  }

  let messageId = resp.messageId;
  if (!messageId && resp.type === 'editMessageText') {
    messageId = getKbSession(chatId)?.lastMessageId;
  }
  // Prefer in-place edit for pure inline updates (answer / next without keyboard change)
  const preferEdit = Boolean(messageId) && !hasReplyKb;

  const result = await sendSafeTelegramMessage(token, chatId, resp.text || '', {
    parseMode: 'Markdown',
    replyMarkup: resp.replyMarkup,
    replyKeyboard: resp.replyKeyboard,
    messageId,
    preferEdit,
  });

  if (!result.ok) {
    console.warn('[Telegram] send failed:', result.error);
    if (preferEdit) {
      const r2 = await sendSafeTelegramMessage(token, chatId, resp.text || '', {
        parseMode: 'Markdown',
        replyMarkup: resp.replyMarkup,
      });
      if (r2.ok) rememberId(r2.messageIds);
    }
    return;
  }
  rememberId(result.messageIds);
}
