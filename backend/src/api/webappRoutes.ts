import type { Express, Request, Response } from 'express';
import { store } from '../store.js';
import { validateWebAppInitData } from '../telegram/webappAuth.js';
import { calculateAttemptScore, updateExamRanks } from '../services/scoringService.js';
import { effectiveExamStatus } from '../examStatus.js';

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken || '';
}

function authWebapp(req: Request, res: Response): { userId: number; user?: any } | null {
  const initData = String(req.body?.initData || '');
  const auth = validateWebAppInitData(initData, botToken());
  if (!auth.ok) {
    res.status(401).json({ error: auth.error || 'Unauthorized' });
    return null;
  }
  return { userId: auth.userId, user: auth.user };
}

function summaryExam(e: any) {
  return {
    id: e.id,
    title: e.title,
    subject: e.subject || '',
    className: e.className || '',
    totalQuestions: e.totalQuestions || e.questions?.length || 0,
    durationMinutes: e.durationMinutes || 60,
    totalMarks: e.totalMarks || 0,
    startDate: e.startDate,
    status: effectiveExamStatus(e),
    resultVisibility: e.resultVisibility || 'PUBLISHED',
    negativeMarking: e.negativeMarking || 0,
  };
}

function publicQuestions(exam: any) {
  return (exam.questions || []).map((q: any) => ({
    id: q.id,
    question: q.question || '',
    options: q.options || [],
    marks: q.marks ?? 1,
    negativeMarks: q.negativeMarks ?? 0,
    imageFileId: q.image?.fileId || null,
    // never leak correct answer during live exam
  }));
}

function secondsLeft(attempt: any): number {
  if (!attempt?.expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

export function registerWebappRoutes(app: Express) {
  app.post('/api/webapp/session', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const student = store.getStudentByTelegramId(auth.userId) || null;
    res.json({
      user: {
        id: auth.userId,
        firstName: auth.user?.first_name,
        username: auth.user?.username,
      },
      student: student
        ? {
            id: student.id,
            name: student.name,
            studentId: student.studentId,
            className: student.className,
            telegramUserId: student.telegramUserId,
            status: student.status,
          }
        : null,
    });
  });

  app.post('/api/webapp/exams', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const student = store.getStudentByTelegramId(auth.userId);
    // Exams the student has touched, plus live exams linked via teacher
    const attempts = store.getAttempts().filter(
      (a: any) => Number(a.telegramUserId) === auth.userId
    );
    const examIds = new Set(attempts.map((a: any) => a.examId));
    // Also include exams from teachers linked to student
    const all = store.getExams();
    const exams = all
      .filter((e: any) => {
        if (examIds.has(e.id)) return true;
        if (student?.teacherIds?.includes(e.teacherId)) return true;
        return false;
      })
      .map(summaryExam);
    // If none, show recent live/scheduled as discovery (limited)
    if (exams.length === 0) {
      res.json({
        exams: all
          .filter((e: any) => {
            const s = effectiveExamStatus(e);
            return s === 'LIVE' || s === 'SCHEDULED';
          })
          .slice(0, 30)
          .map(summaryExam),
      });
      return;
    }
    res.json({ exams });
  });

  app.post('/api/webapp/exam', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const exam = store.getExamById(String(req.body?.examId || ''));
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json({ exam: summaryExam(exam) });
  });

  app.post('/api/webapp/start', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const examId = String(req.body?.examId || '');
    const forceNew = !!req.body?.forceNew;
    const exam = store.getExamById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    let student = store.getStudentByTelegramId(auth.userId);
    if (!student) {
      // Soft-create linked student from Telegram profile
      const name =
        [auth.user?.first_name, auth.user?.last_name].filter(Boolean).join(' ') ||
        auth.user?.username ||
        `Student ${auth.userId}`;
      student = {
        id: `STU_${auth.userId}`,
        studentId: `TG-${auth.userId}`,
        name,
        className: '',
        telegramUserId: auth.userId,
        telegramUsername: auth.user?.username || null,
        linkCode: '',
        status: 'linked',
        teacherIds: exam.teacherId ? [exam.teacherId] : [],
        joinedAt: new Date().toISOString(),
      } as any;
      await store.saveStudent(student);
    } else if (exam.teacherId) {
      try { (store as any).linkStudentToTeacher?.(student.id, exam.teacherId); } catch { /* */ }
    }

    let attempt = store.getAttempt(examId, auth.userId);
    if (attempt && attempt.status === 'IN_PROGRESS' && !forceNew) {
      if (secondsLeft(attempt) <= 0) {
        // auto-submit path left to submit endpoint
      } else {
        if (!attempt.answers || Object.keys(attempt.answers).length === 0) {
          try {
            await store.loadAttemptAnswers(attempt.id);
          } catch {
            /* */
          }
        }
        return res.json({
          attempt,
          exam: summaryExam(exam),
          questions: publicQuestions(exam),
          secondsLeft: secondsLeft(attempt),
        });
      }
    }

    const now = new Date();
    const attemptNumber = await store.nextAttemptNumber(examId, auth.userId);
    const windowStart = new Date(exam.startDate).getTime();
    const windowEnd = windowStart + Math.max(1, exam.durationMinutes || 60) * 60 * 1000;
    const windowOpen = Date.now() >= windowStart && Date.now() < windowEnd;
    const priorOfficial = store
      .getStudentAttempts(examId, auth.userId)
      .some((a: any) => a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'));
    const isOfficial = windowOpen && !priorOfficial;
    let expiresMs = now.getTime() + Math.max(1, exam.durationMinutes || 60) * 60 * 1000;
    if (isOfficial) expiresMs = Math.min(expiresMs, windowEnd);

    attempt = {
      id: `ATT_${Date.now()}_${auth.userId}`,
      examId,
      studentId: student.studentId || student.id,
      telegramUserId: auth.userId,
      studentName: student.name,
      studentClass: student.className || '',
      startedAt: now.toISOString(),
      expiresAt: new Date(expiresMs).toISOString(),
      submittedAt: null,
      status: 'IN_PROGRESS',
      currentQuestionIndex: 0,
      answers: {},
      score: 0,
      maxScore: exam.totalMarks || 0,
      percentage: 0,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      timeTakenSeconds: 0,
      rank: null,
      isOfficial,
      attemptNumber,
    } as any;
    await store.saveAttempt(attempt);

    res.json({
      attempt,
      exam: summaryExam(exam),
      questions: publicQuestions(exam),
      secondsLeft: secondsLeft(attempt),
    });
  });

  app.post('/api/webapp/answer', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const attemptId = String(req.body?.attemptId || '');
    const questionId = String(req.body?.questionId || '');
    const optionIndex = req.body?.optionIndex;
    const attempt = store.getAttempts().find((a: any) => a.id === attemptId);
    if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    if (attempt.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Exam not in progress' });
    if (secondsLeft(attempt) <= 0) return res.status(400).json({ error: 'Time expired' });

    if (!attempt.answers) attempt.answers = {};
    if (optionIndex === null || optionIndex === undefined) {
      delete attempt.answers[questionId];
    } else {
      attempt.answers[questionId] = Number(optionIndex);
    }
    await store.saveAttempt(attempt);
    res.json({ ok: true });
  });

  app.post('/api/webapp/index', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const attemptId = String(req.body?.attemptId || '');
    const index = Number(req.body?.index || 0);
    const attempt = store.getAttempts().find((a: any) => a.id === attemptId);
    if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    if (attempt.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Exam not in progress' });
    attempt.currentQuestionIndex = Math.max(0, index);
    await store.saveAttempt(attempt);
    res.json({ ok: true });
  });

  app.post('/api/webapp/submit', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const attemptId = String(req.body?.attemptId || '');
    const attempt = store.getAttempts().find((a: any) => a.id === attemptId);
    if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    if (attempt.status !== 'IN_PROGRESS') {
      return res.json({ attempt });
    }
    const exam = store.getExamById(attempt.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    if (!attempt.answers) {
      try {
        await store.loadAttemptAnswers(attempt.id);
      } catch {
        attempt.answers = {};
      }
    }

    const timeTakenSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
    );
    const scored = calculateAttemptScore(exam, attempt.answers || {}, timeTakenSeconds);
    Object.assign(attempt, scored);
    attempt.status = secondsLeft(attempt) <= 0 ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    attempt.submittedAt = new Date().toISOString();
    attempt.timeTakenSeconds = timeTakenSeconds;
    await store.saveAttempt(attempt);
    try {
      await updateExamRanks(exam.id);
    } catch {
      /* */
    }
    res.json({ attempt });
  });

  app.post('/api/webapp/results', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const attempts = store
      .getAttempts()
      .filter(
        (a: any) =>
          Number(a.telegramUserId) === auth.userId &&
          (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
      )
      .sort((a: any, b: any) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
      .slice(0, 50)
      .map((a: any) => {
        const exam = store.getExamById(a.examId);
        return {
          ...a,
          examTitle: exam?.title || 'Exam',
          // hide scores if not published
          score: exam?.resultVisibility === 'PUBLISHED' ? a.score : undefined,
          percentage: exam?.resultVisibility === 'PUBLISHED' ? a.percentage : undefined,
        };
      });
    res.json({ results: attempts });
  });

  app.post('/api/webapp/review', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const attemptId = String(req.body?.attemptId || '');
    const attempt = store.getAttempts().find((a: any) => a.id === attemptId);
    if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    if (attempt.status !== 'SUBMITTED' && attempt.status !== 'AUTO_SUBMITTED') {
      return res.status(400).json({ error: 'Exam not submitted' });
    }
    const exam = store.getExamById(attempt.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.resultVisibility !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Results not published' });
    }
    if (!attempt.answers || Object.keys(attempt.answers).length === 0) {
      try {
        await store.loadAttemptAnswers(attempt.id);
      } catch {
        /* */
      }
    }
    const questions = (exam.questions || []).map((q: any) => {
      const sel = attempt.answers?.[q.id];
      const has = sel !== undefined && sel !== null;
      let status: 'correct' | 'wrong' | 'unattempted' = 'unattempted';
      if (has) {
        status = q.answer !== null && Number(sel) === Number(q.answer) ? 'correct' : 'wrong';
      }
      return {
        id: q.id,
        question: q.question || '',
        options: q.options || [],
        marks: q.marks ?? 1,
        negativeMarks: q.negativeMarks ?? 0,
        imageFileId: q.image?.fileId || null,
        explanation: q.explanation || '',
        selectedIndex: has ? Number(sel) : null,
        correctIndex: q.answer,
        status,
      };
    });
    res.json({
      exam: { id: exam.id, title: exam.title, subject: exam.subject || '' },
      attempt,
      questions,
    });
  });

  app.post('/api/webapp/leaderboard', async (req, res) => {
    const auth = authWebapp(req, res);
    if (!auth) return;
    const examId = String(req.body?.examId || '');
    const exam = store.getExamById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.leaderboardVisibility !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Leaderboard not published' });
    }
    const rows = store
      .getAttempts(examId)
      .filter(
        (a: any) =>
          (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') && a.isOfficial !== false
      )
      .slice()
      .sort((a: any, b: any) => (a.rank || 9999) - (b.rank || 9999) || b.score - a.score)
      .slice(0, 50)
      .map((a: any, i: number) => ({
        rank: a.rank || i + 1,
        name: a.studentName || 'Student',
        score: a.score,
        percentage: a.percentage,
        isMe: Number(a.telegramUserId) === auth.userId,
      }));
    res.json({ exam: { id: exam.id, title: exam.title }, rows });
  });
}
