import { store } from './store.js';
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
} from './types.js';

// Calculate authoritative scores for an attempt
export function calculateAttemptScore(exam: Exam, answers: Record<string, number>, timeTakenSecs: number) {
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  let score = 0;

  exam.questions.forEach((q) => {
    const selected = answers[q.id];
    if (selected === undefined || selected === null) {
      skippedCount++;
    } else if (q.answer !== null && selected === q.answer) {
      correctCount++;
      score += q.marks || 1;
    } else {
      wrongCount++;
      const neg = q.negativeMarks || exam.negativeMarking || 0;
      score -= neg;
    }
  });

  score = Math.max(0, score);
  const maxScore = exam.totalMarks || exam.questions.reduce((acc, q) => acc + (q.marks || 1), 0);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100 * 10) / 10 : 0;

  return {
    score,
    maxScore,
    percentage,
    correctCount,
    wrongCount,
    skippedCount,
    timeTakenSeconds: timeTakenSecs
  };
}

// Recalculate ranks for all attempts of an exam according to default ranking rules:
// Priority: 1. Higher score -> 2. Lower time taken -> 3. Earlier submission timestamp
export function updateExamRanks(examId: string) {
  // Only FIRST (official) attempts count toward ranking
  const attempts = store.getAttempts(examId).filter(a =>
    (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') && a.isOfficial !== false
  );

  attempts.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return aTime - bTime;
  });

  // Clear ranks on non-official attempts
  store.getAttempts(examId).forEach(att => {
    if (att.isOfficial === false) {
      att.rank = undefined;
      store.saveAttempt(att);
    }
  });

  attempts.forEach((att, idx) => {
    att.rank = idx + 1;
    store.saveAttempt(att);
  });
}

function isExamTimeEnded(exam: Exam): boolean {
  if (exam.status === 'ENDED' || exam.status === 'RESULTS_PUBLISHED') return true;
  const start = new Date(exam.startDate).getTime();
  const end = start + (exam.durationMinutes || 0) * 60 * 1000;
  // Also consider exam window: if teacher set LIVE without end, use generous window
  // Ranking visible when status ended OR now past start+duration for non-live
  if (exam.status === 'LIVE') {
    // For LIVE exams, ranks after individual submission time isn't enough —
    // show ranks only when teacher marks ENDED/RESULTS_PUBLISHED OR past a soft end of start+duration
    return Date.now() >= end;
  }
  return Date.now() >= end;
}

// Format timer remaining string
function formatRemaining(expiresAtIso: string): string {
  const expiresAt = new Date(expiresAtIso).getTime();
  const now = Date.now();
  const diff = Math.max(0, expiresAt - now);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

export async function processTelegramUpdate(update: TelegramUpdate): Promise<SimulatorResponse | null> {
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
    if (data === 'btn_exams') {
      response = renderExamsList(student);
    } else if (data === 'btn_results') {
      response = renderStudentResults(student);
    } else if (data === 'btn_leaderboard') {
      response = renderStudentLeaderboard(student);
    } else if (data.startsWith('start_exam_') || data.startsWith('resume_exam_')) {
      const examId = data.replace('start_exam_', '').replace('resume_exam_', '');
      response = handleStartOrResumeExam(examId, student, user);
    } else if (data.startsWith('reattempt_')) {
      const examId = data.replace('reattempt_', '');
      response = handleStartOrResumeExam(examId, student, user, true);
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
          response = handleOptionSelect(examId, qIdx, optIdx, student, user);
        }
      }
    } else if (data.startsWith('nav_')) {
      // nav_EXAMID_targetIdx
      const rest = data.slice(4); // Remove "nav_"
      const lastUnderscore = rest.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        const targetIdx = parseInt(rest.slice(lastUnderscore + 1), 10);
        const examId = rest.slice(0, lastUnderscore);
        response = renderQuestionView(examId, targetIdx, student, user);
      }
    } else if (data.startsWith('grid_')) {
      const examId = data.replace('grid_', '');
      response = renderQuestionGrid(examId, student, user);
    } else if (data.startsWith('confirm_submit_')) {
      const examId = data.replace('confirm_submit_', '');
      response = renderSubmitConfirmation(examId, student, user);
    } else if (data.startsWith('do_submit_')) {
      const examId = data.replace('do_submit_', '');
      response = handleFinalSubmit(examId, student, user);
    }

    if (response && cbMessageId && !response.messageId) {
      response.messageId = cbMessageId;
    }
    return response;
  }

  // Handle incoming text commands
  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text.trim();
    const user = msg.from;
    const student = getOrCreateStudent(user);

    // /setname command
    if (text.startsWith('/setname')) {
      const newName = text.replace('/setname', '').trim();
      if (newName) {
        student.name = newName;
        store.saveStudent(student);
        return {
          chatId: user.id,
          text: `✅ *Name Updated Successfully!*\n\n` +
            `Your official exam name is set to: *${newName}*\n` +
            `This name will appear on official exam results and leaderboards.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📚 Available Exams', callback_data: 'btn_exams' }],
              [{ text: '📊 My Results', callback_data: 'btn_results' }]
            ]
          },
          type: 'sendMessage'
        };
      } else {
        return {
          chatId: user.id,
          text: `✏️ *Set Your Name*\n\nPlease provide your name after the command.\n*Example:* \`/setname Alex Johnson\``,
          type: 'sendMessage'
        };
      }
    }

    // Standard /start command
    if (text.startsWith('/start')) {
      const parts = text.trim().split(/\s+/);
      const payload = parts[1] || '';

      // Deep link: /start exam_<examId>
      if (payload.startsWith('exam_')) {
        const examId = payload.slice(5);
        return handleStartOrResumeExam(examId, student, user);
      }

      const notice = store.getSettings().systemNotice;
      return {
        chatId: user.id,
        text: `👋 *Welcome to TeleExam Pro!*\n\n` +
          (notice ? `📢 ${notice}\n\n` : '') +
          `You are registered as *${student.name}*.\n` +
          `✏️ Change display name: \`/setname Your Full Name\`\n\n` +
          `Teachers share a special link for each exam. Open that link to start.\n` +
          `You can also view your past attempts below.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
            [{ text: '📊 My Results', callback_data: 'btn_results' }],
            [{ text: '🏆 Leaderboards', callback_data: 'btn_leaderboard' }]
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
      return renderStudentLeaderboard(student);
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
      text += `   🔒 Locked until ${startDate.toLocaleString()}\n\n`;
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

  return {
    chatId: student.telegramUserId!,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'sendMessage'
  };
}

function handleStartOrResumeExam(examId: string, student: Student, user: TelegramUser, forceNew = false): SimulatorResponse {
  const now = new Date();
  const exam = store.getExamById(examId);

  if (!exam) {
    return {
      chatId: user.id,
      text: `❌ *Exam not found*\n\nAsk your teacher for a valid exam link.`,
      type: 'sendMessage'
    };
  }

  if (exam.status === 'DRAFT') {
    return {
      chatId: user.id,
      text: `🔒 This exam is not open yet.`,
      type: 'sendMessage'
    };
  }

  const startDate = new Date(exam.startDate);
  if (now < startDate) {
    return {
      chatId: user.id,
      text: `🔒 *Exam locked until start time*\n\n` +
        `📝 *${exam.title}*\n` +
        `📅 Starts: ${startDate.toLocaleString()}`,
      replyMarkup: {
        inline_keyboard: [[{ text: '🔄 Check again', callback_data: `start_exam_${exam.id}` }]]
      },
      type: 'sendMessage'
    };
  }

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
      return autoSubmitExam(exam, attempt);
    }
    return renderQuestionView(exam.id, attempt.currentQuestionIndex, student, user);
  }

  // Start new attempt (first or reattempt)
  const attemptNumber = allMine.length + 1;
  const isOfficial = !officialExists; // only first completed line is official; if none official yet, this is official
  const startedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + exam.durationMinutes * 60 * 1000).toISOString();

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

  return renderQuestionView(exam.id, 0, student, user);
}

function handleOptionSelect(examId: string, qIdx: number, optIdx: number, student: Student, user: TelegramUser): SimulatorResponse {
  const now = new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found. Please type /exams to see available tests.', type: 'sendMessage' };
  }

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    const startRes = handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) {
      return startRes;
    }
  }

  // Check expiration
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return autoSubmitExam(exam, attempt);
  }

  if (attempt.status !== 'IN_PROGRESS') {
    return renderAttemptSummary(exam, attempt);
  }

  const question = exam.questions[qIdx];
  if (question) {
    attempt.answers[question.id] = optIdx;
    attempt.currentQuestionIndex = qIdx;
    store.saveAttempt(attempt);
  }

  return renderQuestionView(examId, qIdx, student, user);
}

function renderQuestionView(examId: string, qIdx: number, student: Student, user: TelegramUser): SimulatorResponse {
  const now = new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found. Please type /exams to see available tests.', type: 'sendMessage' };
  }

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    const startRes = handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) {
      return startRes;
    }
  }

  // Expiration check
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return autoSubmitExam(exam, attempt);
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
    const label = `${prefix}${String.fromCharCode(65 + oIdx)}. ${optText}`;
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

  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText'
  };
}

function renderQuestionGrid(examId: string, student: Student, user: TelegramUser): SimulatorResponse {
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: '❌ Examination not found.', type: 'sendMessage' };
  }

  let attempt = store.getAttempt(examId, student.telegramUserId!);
  if (!attempt) {
    handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId!);
    if (!attempt) {
      return { chatId: user.id, text: '❌ Exam session missing.', type: 'sendMessage' };
    }
  }

  const answeredCount = Object.keys(attempt.answers).length;
  const total = exam.questions.length;
  const remaining = formatRemaining(attempt.expiresAt);

  let text = `📋 *Question Review Grid*\n`;
  text += `📝 *${exam.title}*\n`;
  text += `⏱️ Time Remaining: *${remaining}*\n`;
  text += `🟢 Answered: ${answeredCount}/${total} | ⚪ Unanswered: ${total - answeredCount}\n\n`;
  text += `Tap any question number below to jump directly to it:`;

  const keyboard: InlineKeyboardButton[][] = [];
  let currentRow: InlineKeyboardButton[] = [];

  exam.questions.forEach((q, idx) => {
    const isAnswered = attempt.answers[q.id] !== undefined;
    const isCurrent = attempt.currentQuestionIndex === idx;
    let label = isAnswered ? `🟢 Q${idx + 1}` : `⚪ Q${idx + 1}`;
    if (isCurrent) label = `👉 ${label}`;

    currentRow.push({
      text: label,
      callback_data: `nav_${exam.id}_${idx}`
    });

    if (currentRow.length === 4 || idx === total - 1) {
      keyboard.push(currentRow);
      currentRow = [];
    }
  });

  keyboard.push([
    { text: '🔙 Back to Current Question', callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex}` },
    { text: '✅ Submit Exam', callback_data: `confirm_submit_${exam.id}` }
  ]);

  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: 'editMessageText'
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
        [{ text: '🔙 Continue Answering', callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex}` }]
      ]
    },
    type: 'editMessageText'
  };
}

function handleFinalSubmit(examId: string, student: Student, user: TelegramUser): SimulatorResponse {
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

  store.saveAttempt(attempt);
  updateExamRanks(exam.id);
  store.addAuditLog('EXAM_SUBMITTED', `Student ${student.name} (${student.studentId}) submitted ${exam.title} with score ${attempt.score}/${attempt.maxScore}`);

  return renderAttemptSummary(exam, attempt);
}

function autoSubmitExam(exam: Exam, attempt: Attempt): SimulatorResponse {
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

  store.saveAttempt(attempt);
  updateExamRanks(exam.id);
  store.addAuditLog('EXAM_AUTO_SUBMITTED', `Exam ${exam.title} auto-submitted for ${attempt.studentName} due to time expiration`);

  return renderAttemptSummary(exam, attempt);
}

function renderAttemptSummary(exam: Exam, attempt: Attempt): SimulatorResponse {
  let text = `🎉 *Examination Submitted*\n\n`;
  text += `📝 *${exam.title}*\n`;
  text += `👤 *Student:* ${attempt.studentName}\n`;
  if (attempt.attemptNumber && attempt.attemptNumber > 1) {
    text += `🔁 Practice attempt #${attempt.attemptNumber} (not ranked)\n`;
  }
  text += `📌 *Status:* ${attempt.status === 'AUTO_SUBMITTED' ? '⏰ Auto-submitted (time up)' : '✅ Submitted'}\n\n`;

  if (exam.resultVisibility === 'PUBLISHED') {
    text += `📊 *Your score*\n`;
    text += `⭐ ${attempt.score} / ${attempt.maxScore} (${attempt.percentage}%)\n`;
    text += `✅ Correct: ${attempt.correctCount} · ❌ Wrong: ${attempt.wrongCount} · ⚪ Skipped: ${attempt.skippedCount}\n`;
    const mins = Math.floor(attempt.timeTakenSeconds / 60);
    const secs = attempt.timeTakenSeconds % 60;
    text += `⏱️ Time: ${mins}m ${secs}s\n`;
    if (attempt.isOfficial !== false && isExamTimeEnded(exam) && attempt.rank) {
      text += `🏆 *Rank:* #${attempt.rank}\n`;
    } else if (attempt.isOfficial !== false && !isExamTimeEnded(exam)) {
      text += `🏆 Rank will appear after the exam ends.\n`;
    }
  } else {
    text += `🔒 Results are hidden by the teacher for now.\n`;
  }

  return {
    chatId: attempt.telegramUserId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
        [{ text: '🏆 Leaderboard', callback_data: 'btn_leaderboard' }],
        [{ text: '🔁 Reattempt (practice)', callback_data: `reattempt_${exam.id}` }]
      ]
    },
    type: 'editMessageText'
  };
}

function renderStudentResults(student: Student): SimulatorResponse {
  const attempts = store.getAttempts().filter(a =>
    (a.telegramUserId === student.telegramUserId || a.studentId === student.studentId) &&
    (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
  );

  if (attempts.length === 0) {
    return {
      chatId: student.telegramUserId!,
      text: `📊 *My Results*\n\nYou have not submitted any exams yet.\nOpen the link from your teacher to start.`,
      replyMarkup: { inline_keyboard: [[{ text: '📚 My Exams', callback_data: 'btn_exams' }]] },
      type: 'sendMessage'
    };
  }

  let text = `📊 *My Results — ${student.name}*\n\n`;

  attempts.forEach((att, idx) => {
    const exam = store.getExamById(att.examId);
    const title = exam ? exam.title : att.examId;
    const practice = att.isOfficial === false ? ' (practice)' : '';
    text += `*${idx + 1}. ${title}*${practice}\n`;
    if (exam && exam.resultVisibility === 'PUBLISHED') {
      text += `   Score: *${att.score}/${att.maxScore}* (${att.percentage}%)`;
      if (att.isOfficial !== false && isExamTimeEnded(exam) && att.rank) {
        text += ` · Rank #${att.rank}`;
      }
      text += `\n\n`;
    } else {
      text += `   🔒 Results hidden\n\n`;
    }
  });

  return {
    chatId: student.telegramUserId!,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '📚 My Exams', callback_data: 'btn_exams' }],
        [{ text: '🏆 Leaderboard', callback_data: 'btn_leaderboard' }]
      ]
    },
    type: 'sendMessage'
  };
}

function matchesClass(studentClass?: string, examClass?: string): boolean {
  if (!studentClass || !examClass) return true;
  const s = studentClass.trim().toLowerCase();
  const e = examClass.trim().toLowerCase();
  if (s === 'all' || s === 'all students' || e === 'all' || e === 'all students') return true;
  return s === e;
}

function renderStudentLeaderboard(student: Student): SimulatorResponse {
  // Only exams the student participated in, and only after exam time ended
  const myExamIds = [...new Set(
    store.getAttempts().filter(a => a.telegramUserId === student.telegramUserId || a.studentId === student.studentId).map(a => a.examId)
  )];
  const exams = myExamIds.map(id => store.getExamById(id)).filter((e): e is Exam => !!e && isExamTimeEnded(e));

  if (exams.length === 0) {
    return {
      chatId: student.telegramUserId!,
      text: `🏆 *Leaderboard*\n\nRankings appear only *after an exam ends*.\n\nComplete an exam and wait until its time is over.`,
      replyMarkup: { inline_keyboard: [[{ text: '📚 My Exams', callback_data: 'btn_exams' }]] },
      type: 'sendMessage'
    };
  }

  let text = `🏆 *Leaderboard*\n_(First attempt only)_\n\n`;

  exams.forEach((exam) => {
    text += `📝 *${exam.title}*\n`;
    const attempts = store.getAttempts(exam.id)
      .filter(a => (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') && a.isOfficial !== false);

    attempts.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
      return 0;
    });

    if (attempts.length === 0) {
      text += `   _No ranked submissions._\n\n`;
    } else {
      attempts.slice(0, 10).forEach((att, idx) => {
        const rankNum = att.rank || (idx + 1);
        const medal = rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : `#${rankNum}`;
        const isMe = (att.telegramUserId === student.telegramUserId || att.studentId === student.studentId) ? ' (You)' : '';
        text += `   ${medal} ${att.studentName}${isMe} — *${att.score}* (${att.percentage}%)\n`;
      });
      text += `\n`;
    }
  });

  return {
    chatId: student.telegramUserId!,
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: '📚 My Exams', callback_data: 'btn_exams' }]]
    },
    type: 'sendMessage'
  };
}

export async function sendTelegramResponse(resp: SimulatorResponse): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken;
  if (!token) return;

  try {
    let endpoint = resp.type === 'editMessageText' ? 'editMessageText' : 'sendMessage';

    // If editMessageText was requested but no messageId is present, fall back to sendMessage
    if (endpoint === 'editMessageText' && !resp.messageId) {
      endpoint = 'sendMessage';
    }

    const payload: any = {
      chat_id: resp.chatId,
      text: resp.text,
      parse_mode: 'Markdown'
    };

    if (endpoint === 'editMessageText' && resp.messageId) {
      payload.message_id = resp.messageId;
    }

    if (resp.replyMarkup) {
      payload.reply_markup = resp.replyMarkup;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data: any = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.warn(`[Telegram API] ${endpoint} failed (${data.description}). Retrying without Markdown parsing...`);
      // If Markdown parsing error or editMessageText mismatch, retry with sendMessage & no parse_mode
      delete payload.parse_mode;
      if (endpoint === 'editMessageText') {
        endpoint = 'sendMessage';
        delete payload.message_id;
      }
      await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {
    console.error('Failed to send Telegram response via Telegram Bot API:', err);
  }
}

