import { store } from '../store.js';
import { escapeMd } from '../middleware/validate.js';
import { sendSafeTelegramMessage } from './safeSend.js';
import {
  TelegramUpdate,
  TelegramUser,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  SimulatorResponse,
  Attempt,
  Exam,
  Question,
  Student
} from '../types.js';

// Calculate authoritative scores for an attempt
export { calculateAttemptScore, updateExamRanks } from '../services/scoringService.js';

// Recalculate ranks for all attempts of an exam according to default ranking rules:
// Priority: 1. Higher score -> 2. Lower time taken -> 3. Earlier submission timestamp


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

function linkStudentToTeacher(student: Student, teacherId?: string | null) {
  if (!teacherId) return student;
  const ids = Array.isArray(student.teacherIds) ? [...student.teacherIds] : [];
  if (!ids.includes(teacherId)) {
    ids.push(teacherId);
    student.teacherIds = ids;
    store.saveStudent(student);
  }
  return student;
}

export function getOrCreateStudent(user: TelegramUser): Student {
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
      linkedAt: now
    };
    store.saveStudent(student);
    store.addAuditLog('STUDENT_AUTO_REGISTERED', `Auto-registered Telegram student ${name} (${telegramUsername || user.id})`);
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
      store.saveStudent(student);
    }
  }

  return student;
}


function renderMainMenu(student: Student): SimulatorResponse {
  const notice = store.getSettings().systemNotice;
  return {
    chatId: student.telegramUserId!,
    text: `👋 *Welcome to Quiz Bot by Pusparghya!*

` +
      (notice ? `📢 ${notice}

` : '') +
      `You are registered as *${student.name}*.

` +
      `Teachers share a special link for each exam. Open that link to start.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
        [{ text: '📊 My Results', callback_data: 'btn_results' }],
        [{ text: '🏆 Leaderboards', callback_data: 'btn_leaderboard' }],
        [{ text: '✏️ Set your name', callback_data: 'btn_setname' }]
      ]
    },
    type: 'editMessageText'
  };
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<SimulatorResponse | null> {
  // Idempotent: ignore already-processed Telegram updates (retries / multi-instance)
  if (update.update_id != null) {
    const claimed = await store.claimTelegramUpdate(Number(update.update_id));
    if (!claimed) {
      return null;
    }
  }

  const now = new Date();

  // Handle callback queries (button clicks)
  if (update.callback_query) {
    const cb = update.callback_query;
    const user = cb.from;
    const data = cb.data || '';
    const student = getOrCreateStudent(user);
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
    } else if (data === 'btn_results') {
      response = renderStudentResults(student);
    } else if (data === 'btn_leaderboard') {
      response = renderStudentLeaderboard(student, false);
    } else if (data === 'leaderboard_more') {
      response = renderStudentLeaderboard(student, true);
    } else if (data.startsWith('start_exam_') || data.startsWith('resume_exam_')) {
      const examId = data.replace('start_exam_', '').replace('resume_exam_', '');
      response = await handleStartOrResumeExam(examId, student, user);
    } else if (data.startsWith('reattempt_')) {
      const examId = data.replace('reattempt_', '');
      response = await handleStartOrResumeExam(examId, student, user, true);
    } else if (data.startsWith('ans_')) {
      // ans_EXAMID_qIdx_optIdx
      const rest = data.slice(4); // Remove "ans_"
      const lastUnderscore = rest.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        const optIdx = parseInt(rest.slice(lastUnderscore + 1), 10);
        const rem = rest.slice(0, lastUnderscore);
        const secondLastUnderscore = rem.lastIndexOf('_');
        if (secondLastUnderscore !== -1) {
          const qIdx = parseInt(rem.slice(secondLastUnderscore + 1), 10);
          const examId = rem.slice(0, secondLastUnderscore);
          response = await handleOptionSelect(examId, qIdx, optIdx, student, user);
        }
      }
    } else if (data.startsWith('nav_')) {
      // nav_EXAMID_targetIdx
      const rest = data.slice(4); // Remove "nav_"
      const lastUnderscore = rest.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        const targetIdx = parseInt(rest.slice(lastUnderscore + 1), 10);
        const examId = rest.slice(0, lastUnderscore);
        response = await renderQuestionView(examId, targetIdx, student, user);
      }
    } else if (data.startsWith('grid_')) {
      // grid_EXAMID or grid_EXAMID_PAGE
      const rest = data.slice(5);
      const lastUnderscore = rest.lastIndexOf('_');
      let examId = rest;
      let page = 0;
      if (lastUnderscore !== -1) {
        const maybePage = rest.slice(lastUnderscore + 1);
        if (/^\d+$/.test(maybePage)) {
          page = parseInt(maybePage, 10);
          examId = rest.slice(0, lastUnderscore);
        }
      }
      response = await renderQuestionGrid(examId, student, user, page);
    } else if (data.startsWith('rev_')) {
      // rev_EXAMID_sum | rev_EXAMID_PAGE
      const rest = data.slice(4);
      const lastUnderscore = rest.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        const examId = rest.slice(0, lastUnderscore);
        const pagePart = rest.slice(lastUnderscore + 1);
        const exam = store.getExamById(examId);
        // Prefer latest submitted attempt (official first, then any)
        const mine = store.getStudentAttempts(examId, student.telegramUserId!).filter(
          (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'
        );
        const attempt =
          mine.find((a) => a.isOfficial !== false) ||
          mine[mine.length - 1] ||
          (exam ? store.getAttempt(examId, student.telegramUserId!) : undefined);
        if (exam && attempt) {
          if (pagePart === 'sum') {
            response = renderAttemptSummary(exam, attempt, null);
          } else {
            response = renderAttemptSummary(exam, attempt, parseInt(pagePart, 10) || 0);
          }
        }
      }
    } else if (data.startsWith('confirm_submit_')) {
      const examId = data.replace('confirm_submit_', '');
      response = renderSubmitConfirmation(examId, student, user);
    } else if (data.startsWith('do_submit_')) {
      const examId = data.replace('do_submit_', '');
      response = await handleFinalSubmit(examId, student, user);
    }

    // Single-chat UI: always edit the same message on button taps
    if (response && cbMessageId) {
      response.messageId = cbMessageId;
      response.type = 'editMessageText';
    }
    return response;
  }

  // Handle incoming text commands
  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text.trim();
    const user = msg.from;
    const student = getOrCreateStudent(user);

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
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
              [{ text: '🏠 Main menu', callback_data: 'btn_home' }]
            ]
          },
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

      const notice = store.getSettings().systemNotice;
      return {
        chatId: user.id,
        text: `👋 *Welcome to Quiz Bot by Pusparghya!*\n\n` +
          (notice ? `📢 ${notice}\n\n` : '') +
          `You are registered as *${student.name}*.\n` +
          `Teachers share a special link for each exam. Open that link to start.\n` +
          `You can also view your past attempts below.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
            [{ text: '📊 My Results', callback_data: 'btn_results' }],
            [{ text: '🏆 Leaderboards', callback_data: 'btn_leaderboard' }],
            [{ text: '✏️ Set your name', callback_data: 'btn_setname' }]
          ]
        },
        type: 'sendMessage'
      };
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
  const now = new Date();
  // Only exams this student has already opened (via teacher link) or attempted
  const myAttempts = store.getAttempts().filter(a =>
    a.telegramUserId === student.telegramUserId || a.studentId === student.studentId
  );
  const examIds = [...new Set(myAttempts.map(a => a.examId))];
  const exams = examIds.map(id => store.getExamById(id)).filter(Boolean) as Exam[];

  if (exams.length === 0) {
    return {
      chatId: student.telegramUserId!,
      text: `📚 *My Exams*\n\nYou have no exams yet.\n\nAsk your teacher for the *exam link*. Opening that link starts the exam.`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📊 My Results', callback_data: 'btn_results' }],
          [{ text: '🏆 Leaderboards', callback_data: 'btn_leaderboard' }]
        ]
      },
      type: 'sendMessage'
    };
  }

  let text = `📚 *My Exams*\n\n`;
  const keyboard: InlineKeyboardButton[][] = [];

  exams.forEach((exam, idx) => {
    const startDate = new Date(exam.startDate);
    const isLocked = now < startDate;
    const attempts = store.getStudentAttempts(exam.id, student.telegramUserId!);
    const active = attempts.find(a => a.status === 'IN_PROGRESS');
    const officialDone = attempts.find(a => a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'));
    const anyDone = attempts.some(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');

    text += `*${idx + 1}. ${exam.title}*\n`;
    text += `   ${exam.subject || ''} · ${exam.totalQuestions} Qs · ${exam.durationMinutes} min\n`;

    if (isLocked) {
      text += `   🔒 Locked until ${formatInIST(startDate)}\n\n`;
      keyboard.push([{ text: `🔒 ${exam.title}`, callback_data: `start_exam_${exam.id}` }]);
    } else if (active) {
      text += `   ⚡ In progress (${formatRemaining(active.expiresAt)} left)\n\n`;
      keyboard.push([{ text: `▶ Resume · ${exam.title}`, callback_data: `resume_exam_${exam.id}` }]);
    } else if (anyDone) {
      const score = officialDone ? `${officialDone.score}/${officialDone.maxScore}` : 'done';
      text += `   ✅ Attempted (${score}) — you can reattempt for practice\n\n`;
      keyboard.push([
        { text: `📊 Result · ${exam.title}`, callback_data: `start_exam_${exam.id}` },
        { text: `🔁 Reattempt`, callback_data: `reattempt_${exam.id}` }
      ]);
    } else {
      text += `   🟢 Ready to start\n\n`;
      keyboard.push([{ text: `🚀 Start · ${exam.title}`, callback_data: `start_exam_${exam.id}` }]);
    }
  });

  keyboard.push([{ text: '📊 My Results', callback_data: 'btn_results' }]);
  keyboard.push([{ text: '🏠 Main menu', callback_data: 'btn_home' }]);

  return {
    chatId: student.telegramUserId!,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText'
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
  linkStudentToTeacher(student, exam.teacherId);

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
    return await renderQuestionView(exam.id, attempt.currentQuestionIndex, student, user);
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

  // If practice (window closed or reattempt), show a notice then questions
  if (!isOfficial) {
    return {
      chatId: user.id,
      text: windowOpen
        ? `🔁 *Practice attempt*\n\nThis will *not* count on the leaderboard (you already have an official attempt).\n\n📝 ${exam.title}`
        : `🔁 *Practice mode*\n\nThe official exam window has ended.\n📅 Window: ${formatInIST(new Date(getExamWindow(exam).start))} → ${formatInIST(new Date(getExamWindow(exam).end))}\n\nYou can still practice — scores will *not* affect the leaderboard.\n\n📝 ${exam.title}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '▶ Continue to questions', callback_data: `resume_exam_${exam.id}` }],
          [{ text: '🏠 Main menu', callback_data: 'btn_home' }]
        ]
      },
      type: 'sendMessage'
    };
  }

  return await renderQuestionView(exam.id, 0, student, user);
}

async function handleOptionSelect(examId: string, qIdx: number, optIdx: number, student: Student, user: TelegramUser): Promise<SimulatorResponse> {
  const now = new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found. Please type /exams to see available tests.', type: 'sendMessage' };
  }

  // Enroll only when student is allowed past the lock checks (authorized access)
  linkStudentToTeacher(student, exam.teacherId);

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

  return await renderQuestionView(examId, qIdx, student, user);
}

async function renderQuestionView(examId: string, qIdx: number, student: Student, user: TelegramUser): Promise<SimulatorResponse> {
  const now = new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found. Please type /exams to see available tests.', type: 'sendMessage' };
  }

  // Enroll only when student is allowed past the lock checks (authorized access)
  linkStudentToTeacher(student, exam.teacherId);

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    const startRes = await handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) {
      return startRes;
    }
  }

  // Expiration check
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return await autoSubmitExam(exam, attempt);
  }

  attempt.currentQuestionIndex = qIdx;
  store.saveAttempt(attempt);

  const total = exam.questions.length;
  const question = exam.questions[qIdx];
  const selectedOpt = attempt.answers[question.id];

  const remaining = formatRemaining(attempt.expiresAt);

  let text = `📝 *${exam.title}*\n`;
  text += `⏱️ *${remaining} remaining* | Question ${qIdx + 1}/${total}\n\n`;
  text += `${question.question}\n\n`;

  if (selectedOpt !== undefined) {
    text += `*Your Selected Answer:* Option ${String.fromCharCode(65 + selectedOpt)}: ${question.options[selectedOpt]}\n`;
  } else {
    text += `*Status:* ⚪ Unanswered\n`;
  }

  // Build inline options buttons
  const keyboard: InlineKeyboardButton[][] = [];

  question.options.forEach((optText, oIdx) => {
    const isSelected = selectedOpt === oIdx;
    const prefix = isSelected ? '🔘 ' : '⚪ ';
    let label = `${prefix}${String.fromCharCode(65 + oIdx)}. ${optText}`;
    if (label.length > 60) label = label.slice(0, 57) + '…';
    keyboard.push([{
      text: label,
      callback_data: `ans_${exam.id}_${qIdx}_${oIdx}`
    }]);
  });

  // Navigation row
  const navRow: InlineKeyboardButton[] = [];
  if (qIdx > 0) {
    navRow.push({ text: '◀ Previous', callback_data: `nav_${exam.id}_${qIdx - 1}` });
  }
  if (qIdx < total - 1) {
    navRow.push({ text: 'Next ▶', callback_data: `nav_${exam.id}_${qIdx + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  // Action row
  keyboard.push([
    { text: '📋 Question Grid', callback_data: `grid_${exam.id}` },
    { text: '✅ Submit Exam', callback_data: `confirm_submit_${exam.id}` }
  ]);
  keyboard.push([{ text: '🏠 Main menu', callback_data: 'btn_home' }]);

  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText'
  };
}

async function renderQuestionGrid(examId: string, student: Student, user: TelegramUser, page = 0): Promise<SimulatorResponse> {
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found.', type: 'sendMessage' };
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
  const PER_PAGE = 16; // 4x4 buttons — stays within Telegram button limits
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const start = p * PER_PAGE;
  const end = Math.min(start + PER_PAGE, total);

  let text = `📋 *Question Review Grid*\n`;
  text += `📝 *${escapeMd(exam.title)}*\n`;
  text += `⏱️ Time Remaining: *${remaining}*\n`;
  text += `🟢 Answered: ${answeredCount}/${total} | ⚪ Unanswered: ${total - answeredCount}\n`;
  text += `📄 Page ${p + 1}/${totalPages} (Q${start + 1}–Q${end})\n\n`;
  text += `Tap a question number to jump to it:`;

  const keyboard: InlineKeyboardButton[][] = [];
  let currentRow: InlineKeyboardButton[] = [];

  for (let idx = start; idx < end; idx++) {
    const q = exam.questions[idx];
    const isAnswered = attempt.answers?.[q.id] !== undefined;
    const isCurrent = attempt.currentQuestionIndex === idx;
    let label = isAnswered ? `🟢 Q${idx + 1}` : `⚪ Q${idx + 1}`;
    if (isCurrent) label = `👉 Q${idx + 1}`;

    currentRow.push({
      text: label,
      callback_data: `nav_${exam.id}_${idx}`,
    });

    if (currentRow.length === 4 || idx === end - 1) {
      keyboard.push(currentRow);
      currentRow = [];
    }
  }

  const nav: InlineKeyboardButton[] = [];
  if (p > 0) nav.push({ text: '◀ Prev page', callback_data: `grid_${exam.id}_${p - 1}` });
  if (p < totalPages - 1) nav.push({ text: 'Next page ▶', callback_data: `grid_${exam.id}_${p + 1}` });
  if (nav.length) keyboard.push(nav);

  keyboard.push([
    { text: '🔙 Back to question', callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex}` },
    { text: '✅ Submit Exam', callback_data: `confirm_submit_${exam.id}` },
  ]);
  keyboard.push([{ text: '🏠 Main menu', callback_data: 'btn_home' }]);

  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText',
  };
}

function renderSubmitConfirmation(examId: string, student: Student, user: TelegramUser): SimulatorResponse {
  const exam = store.getExamById(examId);
  const attempt = store.getAttempt(examId, student.telegramUserId!);

  if (!exam || !attempt) {
    return { chatId: user.id, text: '❌ Exam session missing.', type: 'sendMessage' };
  }

  const answeredCount = Object.keys(attempt.answers).length;
  const total = exam.questions.length;
  const unansweredCount = total - answeredCount;
  const remaining = formatRemaining(attempt.expiresAt);

  let text = `⚠️ *Confirm Submission*\n\n`;
  text += `📝 *${exam.title}*\n`;
  text += `⏱️ Time Remaining: *${remaining}*\n\n`;
  text += `📊 *Summary:* \n`;
  text += `🟢 Answered Questions: *${answeredCount}*\n`;
  text += `⚪ Skipped/Unanswered: *${unansweredCount}*\n\n`;
  text += `Are you sure you want to finalize and submit your examination now?`;

  return {
    chatId: user.id,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🚀 Yes, Submit Exam Now', callback_data: `do_submit_${exam.id}` }],
        [{ text: '🔙 Continue Answering', callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex}` }],
        [{ text: '🏠 Main menu', callback_data: 'btn_home' }]
      ]
    },
    type: 'editMessageText'
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
  let text = `🎉 *Exam submitted*\n\n`;
  text += `📝 *${escapeMd(exam.title)}*\n`;
  text += `👤 *${escapeMd(attempt.studentName || '')}*\n`;
  if (attempt.attemptNumber && attempt.attemptNumber > 1) {
    text += `🔁 Practice attempt #${attempt.attemptNumber} (not ranked)\n`;
  }
  text += `📌 ${attempt.status === 'AUTO_SUBMITTED' ? '⏰ Auto-submitted (time up)' : '✅ Submitted'}\n\n`;

  const keyboard: InlineKeyboardButton[][] = [];

  if (exam.resultVisibility === 'PUBLISHED') {
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

    const totalQ = exam.questions.length;
    const PER_PAGE = 5;
    const totalPages = Math.max(1, Math.ceil(totalQ / PER_PAGE));

    if (reviewPage === null) {
      // Summary only — stays under Telegram limit even with 100+ questions
      text += `\n📖 Tap *Review answers* to see each question (page by page).`;
      if (totalQ > 0) {
        keyboard.push([{ text: `📖 Review answers (1/${totalPages})`, callback_data: `rev_${exam.id}_0` }]);
      }
    } else {
      const page = Math.max(0, Math.min(reviewPage, totalPages - 1));
      const start = page * PER_PAGE;
      const end = Math.min(start + PER_PAGE, totalQ);
      text += `\n*Questions ${start + 1}–${end} of ${totalQ}* (page ${page + 1}/${totalPages})\n\n`;

      for (let i = start; i < end; i++) {
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
          // Keep lines short for Telegram limit
          const cShort = String(chosen).slice(0, 40);
          const rShort = String(correct).slice(0, 40);
          extra = ok ? `Yours: ${cShort}` : `Yours: ${cShort} · Correct: ${rShort}`;
        }
        const short = escapeMd((q.question || '').slice(0, 50));
        text += `${mark} *Q${i + 1}.* ${short}${ (q.question || '').length > 50 ? '…' : ''}\n   ${escapeMd(extra)}\n`;
      }

      const nav: InlineKeyboardButton[] = [];
      if (page > 0) {
        nav.push({ text: '◀ Previous', callback_data: `rev_${exam.id}_${page - 1}` });
      }
      if (page < totalPages - 1) {
        nav.push({ text: 'Next ▶', callback_data: `rev_${exam.id}_${page + 1}` });
      }
      if (nav.length) keyboard.push(nav);
      keyboard.push([{ text: '📊 Score summary', callback_data: `rev_${exam.id}_sum` }]);
    }
  } else {
    text += `🔒 Results are hidden by the teacher for now.\n`;
  }

  keyboard.push([{ text: '📚 My Exams', callback_data: 'btn_exams' }]);
  keyboard.push([{ text: '🏆 Leaderboard', callback_data: 'btn_leaderboard' }]);
  keyboard.push([{ text: '🔁 Reattempt (practice)', callback_data: `reattempt_${exam.id}` }]);
  keyboard.push([{ text: '🏠 Main menu', callback_data: 'btn_home' }]);

  // Hard safety: never exceed Telegram limit in one edit
  if (text.length > 3900) {
    text = text.slice(0, 3890) + '\n…';
  }

  return {
    chatId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText',
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
      keyboard.push([
        {
          text: `📖 ${idx + 1}. ${(title || 'Exam').slice(0, 28)}`,
          callback_data: `rev_${att.examId}_sum`,
        },
      ]);
    }
  });

  if (text.length > 3500) text = text.slice(0, 3490) + '\n…';

  keyboard.push([{ text: '📚 My Exams', callback_data: 'btn_exams' }]);
  keyboard.push([{ text: '🏆 Leaderboard', callback_data: 'btn_leaderboard' }]);
  keyboard.push([{ text: '🏠 Main menu', callback_data: 'btn_home' }]);

  return {
    chatId: student.telegramUserId!,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText',
  };
}

function matchesClass(studentClass?: string, examClass?: string): boolean {
  if (!studentClass || !examClass) return true;
  const s = studentClass.trim().toLowerCase();
  const e = examClass.trim().toLowerCase();
  if (s === 'all' || s === 'all students' || e === 'all' || e === 'all students') return true;
  return s === e;
}

function renderStudentLeaderboard(student: Student, showAll = false): SimulatorResponse {
  const myExamIds = [...new Set(
    store.getAttempts().filter(a => a.telegramUserId === student.telegramUserId || a.studentId === student.studentId).map(a => a.examId)
  )];
  const exams = myExamIds.map(id => store.getExamById(id)).filter((e): e is Exam => !!e && isExamTimeEnded(e));

  if (exams.length === 0) {
    return {
      chatId: student.telegramUserId!,
      text: `🏆 *Leaderboard*\n\nRankings appear only *after an exam ends*.`,
      replyMarkup: { inline_keyboard: [
        [{ text: '🏠 Main menu', callback_data: 'btn_home' }],
        [{ text: '📚 My Exams', callback_data: 'btn_exams' }]
      ] },
      type: 'editMessageText'
    };
  }

  let text = `🏆 *Leaderboard*\n_(First attempt only)_\n\n`;
  let hasMore = false;
  const keyboard: InlineKeyboardButton[][] = [];

  exams.forEach((exam) => {
    text += `📝 *${exam.title}*\n`;
    const attempts = store.getAttempts(exam.id)
      .filter(a => (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') && a.isOfficial !== false)
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
        return 0;
      });

    if (attempts.length === 0) {
      text += `   _No ranked submissions._\n\n`;
      return;
    }
    const limit = showAll ? attempts.length : 10;
    if (!showAll && attempts.length > 10) hasMore = true;
    attempts.slice(0, limit).forEach((att, idx) => {
      const rankNum = att.rank || (idx + 1);
      const medal = rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : `#${rankNum}`;
      const isMe = (att.telegramUserId === student.telegramUserId || att.studentId === student.studentId) ? ' (You)' : '';
      text += `   ${medal} ${att.studentName}${isMe} — *${att.score}* (${att.percentage}%)\n`;
    });
    if (!showAll && attempts.length > 10) {
      text += `   _…and ${attempts.length - 10} more_\n`;
    }
    text += `\n`;
  });

  if (hasMore && !showAll) {
    keyboard.push([{ text: 'Show full leaderboard', callback_data: 'leaderboard_more' }]);
  }
  keyboard.push([{ text: '📚 My Exams', callback_data: 'btn_exams' }]);
  keyboard.push([{ text: '🏠 Main menu', callback_data: 'btn_home' }]);

  return {
    chatId: student.telegramUserId!,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText'
  };
}

export async function sendTelegramResponse(resp: SimulatorResponse): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken;
  if (!token) return;

  const preferEdit = resp.type === 'editMessageText' && !!resp.messageId;
  const result = await sendSafeTelegramMessage(token, resp.chatId, resp.text || '', {
    parseMode: 'Markdown',
    replyMarkup: resp.replyMarkup,
    messageId: resp.messageId,
    preferEdit,
  });
  if (!result.ok) {
    console.warn('[Telegram] send failed:', result.error);
  }
}
