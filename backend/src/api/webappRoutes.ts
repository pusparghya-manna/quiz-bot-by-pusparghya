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

/** Support both sync and async store methods. */
async function S<T>(v: T | Promise<T>): Promise<T> {
  return await Promise.resolve(v);
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
    leaderboardVisibility: e.leaderboardVisibility || 'PUBLISHED',
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
    subject: q.subject || exam.subject || '',
    imageFileId: q.image?.fileId || null,
    imageUrl: q.image?.fileId
      ? `/api/media/telegram/${encodeURIComponent(q.image.fileId)}`
      : null,
  }));
}

function secondsLeft(attempt: any): number {
  if (!attempt?.expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

function findAttemptById(attemptId: string): any | undefined {
  const all = store.getAttempts() as any[];
  return all.find((a: any) => a.id === attemptId);
}

export function registerWebappRoutes(app: Express) {
  app.post('/api/webapp/session', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      let student = (await S(store.getStudentByTelegramId(auth.userId))) || null;
      // Soft-create student on first Mini App open so profile has a real studentId
      if (!student) {
        const name =
          [auth.user?.first_name, auth.user?.last_name].filter(Boolean).join(' ') ||
          auth.user?.username ||
          `Student ${auth.userId}`;
        const createdStudent = {
          id: `STU_${auth.userId}`,
          studentId: `TG-${auth.userId}`,
          name,
          className: '',
          telegramUserId: auth.userId,
          telegramUsername: auth.user?.username || null,
          linkCode: '',
          status: 'linked',
          teacherIds: [],
          joinedAt: new Date().toISOString(),
        } as any;
        student = createdStudent;
        await store.saveStudent(createdStudent);
      }
      const attempts = (await S(store.getAttempts())) as any[];
      const ongoingRaw = attempts.find(
        (a: any) =>
          Number(a.telegramUserId) === auth.userId &&
          a.status === 'IN_PROGRESS' &&
          secondsLeft(a) > 0
      );
      let ongoing: any = null;
      if (ongoingRaw) {
        const exam = await S(store.getExamById(ongoingRaw.examId));
        ongoing = {
          attemptId: ongoingRaw.id,
          examId: ongoingRaw.examId,
          examTitle: exam?.title || 'Exam',
          secondsLeft: secondsLeft(ongoingRaw),
          currentQuestionIndex: ongoingRaw.currentQuestionIndex || 0,
          answeredCount: Object.keys(ongoingRaw.answers || {}).length,
          totalQuestions: exam?.totalQuestions || exam?.questions?.length || 0,
        };
      }
      res.json({
        user: {
          id: auth.userId,
          firstName: auth.user?.first_name,
          lastName: auth.user?.last_name,
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
        ongoing,
      });
    } catch (e: any) {
      console.error('[webapp/session]', e?.message || e);
      res.status(500).json({ error: 'Session failed' });
    }
  });

  app.post('/api/webapp/profile', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const name = String(req.body?.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'Name required' });
      let student = await S(store.getStudentByTelegramId(auth.userId));
      if (!student) {
        return res.status(404).json({ error: 'Student not found — start an exam first' });
      }
      student = { ...student, name };
      await store.saveStudent(student);
      res.json({
        student: {
          id: student.id,
          name: student.name,
          studentId: student.studentId,
          className: student.className,
          telegramUserId: student.telegramUserId,
          status: student.status,
        },
      });
    } catch (e: any) {
      console.error('[webapp/profile]', e?.message || e);
      res.status(500).json({ error: 'Profile update failed' });
    }
  });

  app.post('/api/webapp/exams', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const student = await S(store.getStudentByTelegramId(auth.userId));
      const attempts = ((await S(store.getAttempts())) as any[]).filter(
        (a: any) => Number(a.telegramUserId) === auth.userId
      );
      const examIds = new Set(attempts.map((a: any) => a.examId));
      const all = (await S(store.getExams())) as any[];
      let exams = all
        .filter((e: any) => {
          if (examIds.has(e.id)) return true;
          if (student?.teacherIds?.includes(e.teacherId)) return true;
          return false;
        })
        .map(summaryExam);

      if (exams.length === 0) {
        exams = all
          .filter((e: any) => {
            const s = effectiveExamStatus(e);
            return s === 'LIVE' || s === 'SCHEDULED';
          })
          .slice(0, 30)
          .map(summaryExam);
      }
      res.json({ exams });
    } catch (e: any) {
      console.error('[webapp/exams]', e?.message || e);
      res.status(500).json({ error: 'Failed to load exams' });
    }
  });

  app.post('/api/webapp/exam', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const exam = await S(store.getExamById(String(req.body?.examId || '')));
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      res.json({ exam: summaryExam(exam) });
    } catch (e: any) {
      console.error('[webapp/exam]', e?.message || e);
      res.status(500).json({ error: 'Failed to load exam' });
    }
  });

  app.post('/api/webapp/start', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const examId = String(req.body?.examId || '');
      const forceNew = !!req.body?.forceNew;
      const exam = await S(store.getExamById(examId));
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      let student = await S(store.getStudentByTelegramId(auth.userId));
      if (!student) {
        const name =
          [auth.user?.first_name, auth.user?.last_name].filter(Boolean).join(' ') ||
          auth.user?.username ||
          `Student ${auth.userId}`;
        const createdStudent = {
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
        student = createdStudent;
        await store.saveStudent(createdStudent);
      } else if (exam.teacherId) {
        try {
          await (store as any).linkStudentTeacher?.(student.id, exam.teacherId);
        } catch {
          /* */
        }
      }

      let attempt = await S(store.getAttempt(examId, auth.userId));
      if (attempt && attempt.status === 'IN_PROGRESS' && !forceNew) {
        if (secondsLeft(attempt) > 0) {
          if (!attempt.answers || Object.keys(attempt.answers).length === 0) {
            try {
              if (typeof (store as any).loadAttemptAnswers === 'function') {
                await (store as any).loadAttemptAnswers(attempt.id);
              }
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

      if (!student) return res.status(500).json({ error: 'Student initialization failed' });

      const now = new Date();
      const attemptNumber = await store.nextAttemptNumber(examId, auth.userId);
      const windowStart = new Date(exam.startDate).getTime();
      const windowEnd = windowStart + Math.max(1, exam.durationMinutes || 60) * 60 * 1000;
      if (Number.isFinite(windowStart) && Date.now() < windowStart) {
        return res.status(403).json({
          error: `Exam has not started yet. It opens at ${new Date(windowStart).toLocaleString()}.`,
        });
      }
      const windowOpen = Date.now() >= windowStart && Date.now() < windowEnd;
      const priorOfficial = (await S(store.getStudentAttempts(examId, auth.userId))).some(
        (a: any) =>
          a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
      );
      const isOfficial = windowOpen && !priorOfficial;
      let expiresMs = now.getTime() + Math.max(1, exam.durationMinutes || 60) * 60 * 1000;
      if (isOfficial) expiresMs = Math.min(expiresMs, windowEnd);

      const createdAttempt = {
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
      attempt = createdAttempt;
      await store.saveAttempt(createdAttempt);

      res.json({
        attempt,
        exam: summaryExam(exam),
        questions: publicQuestions(exam),
        secondsLeft: secondsLeft(attempt),
      });
    } catch (e: any) {
      console.error('[webapp/start]', e?.message || e);
      res.status(500).json({ error: 'Failed to start exam' });
    }
  });

  app.post('/api/webapp/answer', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const attemptId = String(req.body?.attemptId || '');
      const questionId = String(req.body?.questionId || '');
      const optionIndex = req.body?.optionIndex;
      const attempt = findAttemptById(attemptId);
      if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      if (attempt.status !== 'IN_PROGRESS') {
        return res.status(400).json({ error: 'Exam not in progress' });
      }
      // Allow a short post-expiry grace so auto-submit can flush the last selected answers
      const left = secondsLeft(attempt);
      if (left < -15) return res.status(400).json({ error: 'Time expired' });

      if (!attempt.answers) attempt.answers = {};
      if (optionIndex === null || optionIndex === undefined) {
        delete attempt.answers[questionId];
        await store.saveAttempt(attempt);
      } else {
        const idx = Number(optionIndex);
        attempt.answers[questionId] = idx;
        if (typeof store.saveAnswer === 'function') {
          await store.saveAnswer(attempt.id, questionId, idx, attempt.currentQuestionIndex);
        } else {
          await store.saveAttempt(attempt);
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[webapp/answer]', e?.message || e);
      res.status(500).json({ error: 'Failed to save answer' });
    }
  });

  app.post('/api/webapp/index', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const attemptId = String(req.body?.attemptId || '');
      const index = Number(req.body?.index || 0);
      const attempt = findAttemptById(attemptId);
      if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      if (attempt.status !== 'IN_PROGRESS') {
        return res.status(400).json({ error: 'Exam not in progress' });
      }
      attempt.currentQuestionIndex = Math.max(0, index);
      await store.saveAttempt(attempt);
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[webapp/index]', e?.message || e);
      res.status(500).json({ error: 'Failed to update index' });
    }
  });

  app.post('/api/webapp/submit', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const attemptId = String(req.body?.attemptId || '');
      const attempt = findAttemptById(attemptId);
      if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      if (attempt.status !== 'IN_PROGRESS') {
        return res.json({ attempt });
      }
      const exam = await S(store.getExamById(attempt.examId));
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      if (!attempt.answers || Object.keys(attempt.answers).length === 0) {
        try {
          if (typeof (store as any).loadAttemptAnswers === 'function') {
            await (store as any).loadAttemptAnswers(attempt.id);
          }
        } catch {
          attempt.answers = attempt.answers || {};
        }
      }

      // Merge client-side answers (authoritative on submit / auto-submit) so
      // last-second selections are not marked skipped after timer expiry.
      const clientAnswers = req.body?.answers;
      if (clientAnswers && typeof clientAnswers === 'object') {
        if (!attempt.answers) attempt.answers = {};
        for (const [qid, val] of Object.entries(clientAnswers)) {
          if (val === null || val === undefined || qid === '') continue;
          const idx = Number(val);
          if (!Number.isFinite(idx)) continue;
          attempt.answers[String(qid)] = idx;
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

      if (typeof store.submitAttemptIfInProgress === 'function') {
        const ok = await store.submitAttemptIfInProgress(attempt);
        if (!ok) {
          const existing = findAttemptById(attemptId);
          return res.json({ attempt: existing || attempt });
        }
      } else {
        await store.saveAttempt(attempt);
      }

      try {
        await updateExamRanks(exam.id);
      } catch {
        /* */
      }
      res.json({ attempt });
    } catch (e: any) {
      console.error('[webapp/submit]', e?.message || e);
      res.status(500).json({ error: 'Failed to submit' });
    }
  });

  app.post('/api/webapp/results', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const attempts = ((await S(store.getAttempts())) as any[])
        .filter(
          (a: any) =>
            Number(a.telegramUserId) === auth.userId &&
            (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
        )
        .sort((a: any, b: any) =>
          String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
        )
        .slice(0, 50);

      const results = [];
      for (const a of attempts) {
        const exam = await S(store.getExamById(a.examId));
        const published = !exam || exam.resultVisibility === 'PUBLISHED';
        results.push({
          id: a.id,
          examId: a.examId,
          examTitle: exam?.title || 'Exam',
          status: a.status,
          submittedAt: a.submittedAt,
          startedAt: a.startedAt,
          timeTakenSeconds: a.timeTakenSeconds,
          rank: published ? a.rank : undefined,
          score: published ? a.score : undefined,
          maxScore: published ? a.maxScore : undefined,
          percentage: published ? a.percentage : undefined,
          correctCount: published ? a.correctCount : undefined,
          wrongCount: published ? a.wrongCount : undefined,
          skippedCount: published ? a.skippedCount : undefined,
          isOfficial: a.isOfficial,
          attemptNumber: a.attemptNumber,
          resultVisibility: exam?.resultVisibility || 'PUBLISHED',
        });
      }
      res.json({ results });
    } catch (e: any) {
      console.error('[webapp/results]', e?.message || e);
      res.status(500).json({ error: 'Failed to load results' });
    }
  });

  app.post('/api/webapp/review', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const attemptId = String(req.body?.attemptId || '');
      const attempt = findAttemptById(attemptId);
      if (!attempt || Number(attempt.telegramUserId) !== auth.userId) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      if (attempt.status !== 'SUBMITTED' && attempt.status !== 'AUTO_SUBMITTED') {
        return res.status(400).json({ error: 'Exam not submitted' });
      }
      const exam = await S(store.getExamById(attempt.examId));
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      if (exam.resultVisibility !== 'PUBLISHED') {
        return res.status(403).json({ error: 'Results not published' });
      }
      if (!attempt.answers || Object.keys(attempt.answers).length === 0) {
        try {
          if (typeof (store as any).loadAttemptAnswers === 'function') {
            await (store as any).loadAttemptAnswers(attempt.id);
          }
        } catch {
          /* */
        }
      }
      const questions = (exam.questions || []).map((q: any) => {
        const sel = attempt.answers?.[q.id];
        const has = sel !== undefined && sel !== null;
        let status: 'correct' | 'wrong' | 'unattempted' = 'unattempted';
        if (has) {
          status =
            q.answer !== null && Number(sel) === Number(q.answer) ? 'correct' : 'wrong';
        }
        return {
          id: q.id,
          question: q.question || '',
          options: q.options || [],
          marks: q.marks ?? 1,
          negativeMarks: q.negativeMarks ?? 0,
          subject: q.subject || exam.subject || '',
          imageFileId: q.image?.fileId || null,
          imageUrl: q.image?.fileId
            ? `/api/media/telegram/${encodeURIComponent(q.image.fileId)}`
            : null,
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
    } catch (e: any) {
      console.error('[webapp/review]', e?.message || e);
      res.status(500).json({ error: 'Failed to load review' });
    }
  });

  app.post('/api/webapp/leaderboard', async (req, res) => {
    try {
      const auth = authWebapp(req, res);
      if (!auth) return;
      const examId = String(req.body?.examId || '');
      const exam = await S(store.getExamById(examId));
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      if (exam.leaderboardVisibility !== 'PUBLISHED') {
        return res.status(403).json({ error: 'Leaderboard not published' });
      }
      const rows = ((await S(store.getAttempts(examId))) as any[])
        .filter(
          (a: any) =>
            (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') &&
            a.isOfficial !== false
        )
        .slice()
        .sort(
          (a: any, b: any) =>
            (a.rank || 9999) - (b.rank || 9999) || (b.score || 0) - (a.score || 0)
        )
        .slice(0, 50)
        .map((a: any, i: number) => ({
          rank: a.rank || i + 1,
          name: a.studentName || 'Student',
          score: a.score,
          maxScore: a.maxScore,
          percentage: a.percentage,
          timeTakenSeconds: a.timeTakenSeconds,
          isMe: Number(a.telegramUserId) === auth.userId,
        }));
      res.json({ exam: { id: exam.id, title: exam.title }, rows });
    } catch (e: any) {
      console.error('[webapp/leaderboard]', e?.message || e);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });
}
