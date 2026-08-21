import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { env, corsOriginDelegate, assertSecureConfig } from '../config/env.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { clampStr, csvCell } from '../middleware/validate.js';
import { requireTeacher, getOwnedExam, ownsExam, studentBelongsToTeacher, attemptBelongsToTeacher, questionBelongsToTeacher } from '../middleware/ownership.js';
import { initDb } from '../database/client.js';
import { loginTeacher, registerTeacher, authMiddleware, ensureTeachersTable } from '../auth.js';
import { store } from '../store.js';
import { processTelegramUpdate, updateExamRanks, calculateAttemptScore, sendTelegramResponse } from '../telegram/bot.js';
import { startTelegramPolling } from '../telegram/polling.js';
import { parseQuestionsFromMedia } from '../services/geminiOcr.js';
import { Exam, Question, Student } from '../types/index.js';
import { effectiveExamStatus, withEffectiveStatus } from '../examStatus.js';
import { enqueueBroadcast } from '../jobs/broadcastQueue.js';
import { l1Cache, tenantKey, invalidateTeacherCache } from '../cache/l1Cache.js';
dotenv.config();

async function startServer(app?: import('express').Express) {
  const owned = !app;
  app = app || express();

  app.use(cors({ origin: corsOriginDelegate, credentials: true }));
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '12mb' }));
  app.disable('x-powered-by');

  // Health (also registered early in main when app is shared)
  app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'quiz-bot-api' }));

  // Auth (rate-limited)
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: (req) => `auth:${req.ip}` });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      const result = await loginTeacher(username, password);
      res.json(result);
    } catch (e: any) {
      res.status(401).json({ error: e.message || 'Login failed' });
    }
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const { username, password, name } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      const result = await registerTeacher(username, password, name || username);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Registration failed' });
    }
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ teacher: (req as any).teacher });
  });

  // --- API ROUTES (protected) ---
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/telegram')) return next();
    return authMiddleware(req, res, next);
  });


  /** Build tenant-scoped dashboard slices (shared by focused routes). */
  function teacherExamSlice(teacherId: string | undefined) {
    let exams = store.getExams();
    if (teacherId) exams = exams.filter((e: any) => e.teacherId === teacherId);
    else exams = [];
    exams = exams.map((e: any) => withEffectiveStatus(e));
    const examIds = new Set(exams.map((e: any) => e.id));
    const attempts = store.getAttempts().filter((a: any) => examIds.has(a.examId));
    const attemptTgIds = new Set<number>();
    const attemptStudentIds = new Set<string>();
    for (const a of attempts) {
      if (a.telegramUserId) attemptTgIds.add(Number(a.telegramUserId));
      if (a.studentId) attemptStudentIds.add(String(a.studentId));
    }
    let students = store.getStudents();
    if (teacherId) {
      students = students.filter((s: any) => {
        if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
        if (s.telegramUserId && attemptTgIds.has(Number(s.telegramUserId))) return true;
        if (s.studentId && attemptStudentIds.has(String(s.studentId))) return true;
        return false;
      });
      const seen = new Set<string>();
      students = students.filter((s: any) => {
        const key = s.telegramUserId ? `tg:${s.telegramUserId}` : `id:${s.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else {
      students = [];
    }
    return { exams, attempts, students, examIds };
  }

  function publicSettings() {
    const rawSettings = store.getSettings();
    return {
      ...rawSettings,
      telegramBotToken: rawSettings.telegramBotToken ? '••••••••' : '',
      botUsername: rawSettings.botUsername || '@quizbotbypusparghya_bot',
      botActive: true,
    };
  }

  // 1. Dashboard Overview Stats & Complete Data Batch (tenant-scoped L1 cache)
  app.get('/api/data', async (req, res) => {
    const teacher = (req as any).teacher;
    const teacherId = teacher?.username as string | undefined;
    try {
      const payload = await l1Cache.getOrSet(
        tenantKey(teacherId || '', 'dashboard-data'),
        12_000,
        () => {
          let exams = store.getExams();
          if (teacherId) {
            exams = exams.filter((e: any) => e.teacherId === teacherId);
          } else {
            exams = [];
          }
          exams = exams.map((e: any) => withEffectiveStatus(e));
          const examIds = new Set(exams.map((e: any) => e.id));
          const attempts = store.getAttempts().filter((a: any) => examIds.has(a.examId));
          const attemptTgIds = new Set<number>();
          const attemptStudentIds = new Set<string>();
          for (const a of attempts) {
            if (a.telegramUserId) attemptTgIds.add(Number(a.telegramUserId));
            if (a.studentId) attemptStudentIds.add(String(a.studentId));
          }
          let students = store.getStudents();
          if (teacherId) {
            students = students.filter((s: any) => {
              if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
              if (s.telegramUserId && attemptTgIds.has(Number(s.telegramUserId))) return true;
              if (s.studentId && attemptStudentIds.has(String(s.studentId))) return true;
              return false;
            });
            const seen = new Set<string>();
            students = students.filter((s: any) => {
              const key = s.telegramUserId ? `tg:${s.telegramUserId}` : `id:${s.id}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          } else {
            students = [];
          }
          const rawSettings = store.getSettings();
          const settings = {
            ...rawSettings,
            telegramBotToken: rawSettings.telegramBotToken ? '••••••••' : '',
            botUsername: rawSettings.botUsername || '@quizbotbypusparghya_bot',
            botActive: true,
          };
          return {
            exams,
            questions: [],
            students,
            attempts,
            settings,
            auditLogs: store
              .getAuditLogs()
              .filter(
                (l: any) =>
                  !teacherId ||
                  (l.details || '').includes(teacherId) ||
                  l.actor === teacherId
              )
              .slice(0, 30),
          };
        }
      );
      res.json(payload);
    } catch (e: any) {
      console.error('[api/data]', e?.message || e);
      res.status(500).json({ error: 'Failed to load dashboard data' });
    }
  });


  app.get('/api/dashboard/summary', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    try {
      const payload = await l1Cache.getOrSet(tenantKey(teacherId || '', 'summary'), 12_000, () => {
        const { exams, attempts, students } = teacherExamSlice(teacherId);
        const live = exams.filter((e: any) => e.status === 'LIVE').length;
        const done = attempts.filter(
          (a: any) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'
        ).length;
        return {
          examCount: exams.length,
          liveCount: live,
          submissionCount: done,
          studentCount: students.length,
        };
      });
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: 'summary failed' });
    }
  });

  app.get('/api/students', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    try {
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10) || 200));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
      const payload = await l1Cache.getOrSet(
        tenantKey(teacherId || '', `students:${limit}:${offset}`),
        12_000,
        () => {
          const { students } = teacherExamSlice(teacherId);
          return {
            students: students.slice(offset, offset + limit),
            total: students.length,
            limit,
            offset,
          };
        }
      );
      res.json(payload);
    } catch {
      res.status(500).json({ error: 'students failed' });
    }
  });

  app.get('/api/results', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    try {
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10) || 200));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
      const payload = await l1Cache.getOrSet(
        tenantKey(teacherId || '', `results:${limit}:${offset}`),
        10_000,
        () => {
          const { exams, attempts } = teacherExamSlice(teacherId);
          // Strip heavy fields — no answer maps in list
          const slim = attempts.slice(offset, offset + limit).map((a: any) => ({
            id: a.id,
            examId: a.examId,
            studentId: a.studentId,
            telegramUserId: a.telegramUserId,
            studentName: a.studentName,
            status: a.status,
            score: a.score,
            maxScore: a.maxScore,
            percentage: a.percentage,
            rank: a.rank,
            isOfficial: a.isOfficial,
            attemptNumber: a.attemptNumber,
            submittedAt: a.submittedAt,
            startedAt: a.startedAt,
            timeTakenSeconds: a.timeTakenSeconds,
          }));
          return {
            attempts: slim,
            exams: exams.map((e: any) => ({
              id: e.id,
              title: e.title,
              startDate: e.startDate,
              durationMinutes: e.durationMinutes,
              status: e.status,
              totalMarks: e.totalMarks,
            })),
            total: attempts.length,
            limit,
            offset,
          };
        }
      );
      res.json(payload);
    } catch {
      res.status(500).json({ error: 'results failed' });
    }
  });

  app.get('/api/settings', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    try {
      const payload = await l1Cache.getOrSet(tenantKey(teacherId || '', 'settings'), 30_000, () => ({
        settings: publicSettings(),
        auditLogs: store
          .getAuditLogs()
          .filter(
            (l: any) =>
              !teacherId ||
              (l.details || '').includes(teacherId) ||
              l.actor === teacherId
          )
          .slice(0, 30),
      }));
      res.json(payload);
    } catch {
      res.status(500).json({ error: 'settings failed' });
    }
  });

  app.post('/api/reseed', (req, res) => {
    if (!env.enableDangerousReseed) {
      return res.status(403).json({ error: 'Reseed disabled. Set ENABLE_RESEED=true to allow.' });
    }
    const fresh = store.resetToSeed();
    store.addAuditLog('SYSTEM_RESEEDED', 'Reseeded database to clean state');
    res.json(fresh);
  });

  app.get('/api/stats', (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exams = store.getExams().filter((e: any) => e.teacherId === teacherId);
    const students = store.getStudents();
    const attempts = store.getAttempts();

    const activeExamsCount = exams.filter(e => { const s = effectiveExamStatus(e); return s === 'LIVE' || s === 'SCHEDULED'; }).length;
    const completedAttemptsCount = attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED').length;
    
    let totalPctSum = 0;
    const finishedAttempts = attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');
    finishedAttempts.forEach(a => { totalPctSum += a.percentage; });
    const avgPercentage = finishedAttempts.length > 0 ? Math.round((totalPctSum / finishedAttempts.length) * 10) / 10 : 0;

    const linkedStudentsCount = students.filter(s => s.status === 'linked').length;

    res.json({
      totalExams: exams.length,
      activeExamsCount,
      totalStudents: students.length,
      linkedStudentsCount,
      totalSubmissions: completedAttemptsCount,
      avgPercentage,
      questionBankCount: store.getQuestionBank().length,
      classes: ['Class 10-A Biology', 'Class 12-B Physics']
    });
  });

  // 2. Exams Management
  app.get('/api/exams', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    try {
      const payload = await l1Cache.getOrSet(tenantKey(teacherId || '', 'exams-list'), 12_000, () => {
        const { exams } = teacherExamSlice(teacherId);
        // List view without full question banks when possible
        return {
          exams: exams.map((e: any) => ({
            ...e,
            // keep questions for create/edit flows that expect them on full /api/data
            questions: e.questions || [],
          })),
        };
      });
      res.json(payload);
    } catch {
      res.status(500).json({ error: 'exams failed' });
    }
  });

  app.get('/api/exams/:id', (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exam = getOwnedExam(req.params.id, teacherId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    const attempts = store.getAttempts(exam.id);
    res.json({ exam, attempts });
  });

  app.post('/api/exams', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const data = req.body;
    const now = new Date().toISOString();

    const teacher = (req as any).teacher;
    const newExam: Exam = {
      id: `EXAM_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      teacherId,
      title: data.title || 'Untitled Examination',
      subject: data.subject || 'General',
      className: data.className || 'Class 10-A Biology',
      testNumber: data.testNumber || 'Test 01',
      totalQuestions: data.questions ? data.questions.length : 0,
      startDate: data.startDate || now,
      durationMinutes: Number(data.durationMinutes) || 60,
      totalMarks: Number(data.totalMarks) || (data.questions ? data.questions.length : 0),
      negativeMarking: Number(data.negativeMarking) || 0,
      randomizeQuestions: !!data.randomizeQuestions,
      randomizeOptions: !!data.randomizeOptions,
      resultVisibility: data.resultVisibility || 'PUBLISHED',
      leaderboardVisibility: data.leaderboardVisibility || 'PUBLISHED',
      status: effectiveExamStatus({ startDate: data.startDate || now, durationMinutes: Number(data.durationMinutes) || 60 }),
      questions: data.questions || [],
      createdAt: now,
      updatedAt: now
    };

    await store.saveExam(newExam);
        try { const tid = (req as any).teacher?.username; if (tid) invalidateTeacherCache(tid); } catch {}
    await store.addAuditLog('EXAM_CREATED', `Created exam "${newExam.title}" for ${newExam.className}`, teacherId);
    res.json(withEffectiveStatus(newExam));
  });

  app.put('/api/exams/:id', async (req, res) => {
    const exam = store.getExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    if (exam.teacherId && exam.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Not your exam' });
    }

    const updated: Exam = {
      ...exam,
      ...req.body,
      teacherId: exam.teacherId || teacherId,
      id: exam.id,
      totalQuestions: req.body.questions ? req.body.questions.length : exam.totalQuestions,
      updatedAt: new Date().toISOString()
    };
    updated.status = effectiveExamStatus(updated);

    await store.saveExam(updated);
        try { const tid = (req as any).teacher?.username; if (tid) invalidateTeacherCache(tid); } catch {}
    await store.addAuditLog('EXAM_UPDATED', `Updated exam "${updated.title}" (${updated.status})`, teacherId);
    res.json(withEffectiveStatus(updated));
  });

  app.delete('/api/exams/:id', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exam = getOwnedExam(req.params.id, teacherId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    await store.deleteExam(req.params.id);
    try { const tid = (req as any).teacher?.username; if (tid) invalidateTeacherCache(tid); } catch {}
    await store.addAuditLog('EXAM_DELETED', `Deleted exam "${exam.title}"`, teacherId);
    return res.json({ success: true });
  });

  app.post('/api/exams/:id/recalculate', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exam = getOwnedExam(req.params.id, teacherId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const attempts = store.getAttempts(exam.id);
    for (const att of attempts) {
      const stats = calculateAttemptScore(exam, att.answers, att.timeTakenSeconds);
      att.score = stats.score;
      att.maxScore = stats.maxScore;
      att.percentage = stats.percentage;
      att.correctCount = stats.correctCount;
      att.wrongCount = stats.wrongCount;
      att.skippedCount = stats.skippedCount;
      await store.saveAttempt(att);
    }

    updateExamRanks(exam.id);
    await store.addAuditLog('EXAM_RECALCULATED', `Recalculated scores and rankings for ${exam.title}`, teacherId);
    res.json({ success: true, count: attempts.length });
  });

  // 3. Question Bank
  app.get('/api/questions', (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const qs = store.getQuestionBank().filter((q: any) => q.teacherId === teacherId);
    res.json(qs);
  });

  app.post('/api/questions', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const qData = req.body;
    const newQuestion: Question = {
      id: `QB_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      teacherId,
      question: qData.question,
      options: qData.options || ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: qData.answer !== undefined ? qData.answer : null,
      marks: Number(qData.marks) || 1,
      negativeMarks: Number(qData.negativeMarks) || 0,
      subject: qData.subject || 'General',
      explanation: qData.explanation
    };

    await store.saveQuestion(newQuestion);
    await store.addAuditLog('QUESTION_ADDED', `Added question to bank: "${newQuestion.question.substring(0, 40)}..."`, teacherId);
    res.json(newQuestion);
  });

  app.put('/api/questions/:id', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const q = store.getQuestionBank().find(item => item.id === req.params.id);
    if (!q || !questionBelongsToTeacher(q, teacherId)) return res.status(404).json({ error: 'Question not found' });
    const updated = { ...q, ...req.body, teacherId, id: q.id };
    await store.saveQuestion(updated);
    res.json(updated);
  });

  app.delete('/api/questions/:id', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const q = store.getQuestionBank().find(item => item.id === req.params.id);
    if (!q || !questionBelongsToTeacher(q, teacherId)) return res.status(404).json({ error: 'Question not found' });
    await store.deleteQuestion(req.params.id);
    res.json({ success: true });
  });

  // 4. JSON Import
  app.post('/api/questions/import-json', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Payload must contain a "questions" array.' });
    }

    const imported: Question[] = [];
    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const formatted: Question = {
        id: `QB_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
        teacherId,
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: q.answer !== undefined && q.answer !== null ? Number(q.answer) : null,
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        subject: q.subject || 'General'
      };
      await store.saveQuestion(formatted);
      imported.push(formatted);
    }

    await store.addAuditLog('JSON_IMPORTED', `Imported ${imported.length} questions via JSON format`, teacherId);
    res.json({ success: true, count: imported.length, questions: imported });
  });

  // 5. OCR Import via Gemini 3.6 Flash
  const ocrLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (req) => `ocr:${(req as any).teacher?.username || req.ip}` });
  app.post('/api/ocr/parse', ocrLimiter, async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || typeof fileBase64 !== 'string') {
        return res.status(400).json({ error: 'fileBase64 required' });
      }
      if (fileBase64.length > env.maxOcrBase64Chars) {
        return res.status(413).json({ error: 'Image too large' });
      }
      if (!fileBase64) {
        return res.status(400).json({ error: 'fileBase64 string is required.' });
      }

      const result = await parseQuestionsFromMedia(fileBase64, mimeType || 'image/jpeg');
      store.addAuditLog('OCR_PARSED', `Extracted ${result.questions?.length || 0} questions via Gemini OCR`);
      res.json(result);
    } catch (err: any) {
      console.error('OCR error:', err);
      res.status(500).json({ error: err.message || 'Failed to extract questions using AI OCR.' });
    }
  });

  // 6. Student Management
  app.get('/api/students', (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    let students = store.getStudents();
    if (teacherId) {
      const myExamIds = new Set(store.getExams().filter((e: any) => e.teacherId === teacherId).map((e: any) => e.id));
      const myAttempts = store.getAttempts().filter((a: any) => myExamIds.has(a.examId));
      students = students.filter((s: any) => {
        if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
        return myAttempts.some((a: any) => a.studentId === s.studentId || (s.telegramUserId && a.telegramUserId === s.telegramUserId));
      });
    }
    const { className, search, status } = req.query;

    if (className) {
      students = students.filter(s => s.className === className);
    }
    if (status) {
      students = students.filter(s => s.status === status);
    }
    if (search) {
      const q = String(search).toLowerCase();
      students = students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.linkCode.toLowerCase().includes(q)
      );
    }

    res.json(students);
  });

  app.post('/api/students', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const data = req.body;
    const newStudent: Student = {
      id: `STU_${Date.now()}`,
      studentId: data.studentId || `2026-${Date.now()}`,
      name: data.name || 'New Student',
      className: data.className || 'Class 10-A Biology',
      telegramUserId: data.telegramUserId ? Number(data.telegramUserId) : null,
      telegramUsername: data.telegramUsername || null,
      linkCode: `LINK-${Math.floor(10000 + Math.random() * 90000)}`,
      status: data.telegramUserId ? 'linked' : 'unlinked',
      teacherIds: [teacherId]
    };

    await store.saveStudent(newStudent);
    await store.addAuditLog('STUDENT_CREATED', `Added student ${newStudent.name} (${newStudent.studentId})`, teacherId);
    res.json(newStudent);
  });

  app.put('/api/students/:id', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const student = store.getStudentById(req.params.id);
    if (!student || !studentBelongsToTeacher(student, teacherId)) return res.status(404).json({ error: 'Student not found' });
    const updated = { ...student, ...req.body, id: student.id, teacherIds: student.teacherIds };
    await store.saveStudent(updated);
    res.json(updated);
  });

  app.delete('/api/students/:id', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const student = store.getStudentById(req.params.id);
    if (!student || !studentBelongsToTeacher(student, teacherId)) return res.status(404).json({ error: 'Student not found' });
    const myExamIds = new Set(store.getExams().filter((e: any) => e.teacherId === teacherId).map((e: any) => e.id));
    const examIds = [...new Set(store.getAttempts().filter(a =>
      myExamIds.has(a.examId) && (a.studentId === student.studentId || a.telegramUserId === student.telegramUserId)
    ).map(a => a.examId))];
    await store.deleteStudent(student.id);
    examIds.forEach(id => updateExamRanks(id));
    await store.addAuditLog('STUDENT_DELETED', `Removed student ${student.name}`, teacherId);
    res.json({ success: true });
  });

  app.delete('/api/attempts/:id', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const att = store.getAttempts().find(a => a.id === req.params.id);
    if (!att || !attemptBelongsToTeacher(att, teacherId)) return res.status(404).json({ error: 'Attempt not found' });
    await store.deleteAttempt(att.id);
    try { invalidateTeacherCache(teacherId); } catch {}
    updateExamRanks(att.examId);
    await store.addAuditLog('ATTEMPT_DELETED', `Removed attempt ${att.id} for ${att.studentName}`, teacherId);
    res.json({ success: true });
  });

  app.get('/api/attempts/:id/detail', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const att = store.getAttempts().find(a => a.id === req.params.id);
    if (!att || !attemptBelongsToTeacher(att, teacherId)) return res.status(404).json({ error: 'Attempt not found' });
    try {
      const payload = await l1Cache.getOrSet(
        tenantKey(teacherId, `attempt-detail:${att.id}`),
        20_000,
        async () => {
          if (!att.answers || Object.keys(att.answers).length === 0) {
            await store.loadAttemptAnswers(att.id);
          }
          const exam = store.getExamById(att.examId);
          const breakdown = (exam?.questions || []).map((q, idx) => {
            const selected = att.answers?.[q.id];
            const has = selected !== undefined && selected !== null;
            let status: 'correct' | 'wrong' | 'skipped' = 'skipped';
            if (has) {
              status = q.answer !== null && selected === q.answer ? 'correct' : 'wrong';
            }
            return {
              index: idx + 1,
              questionId: q.id,
              question: q.question,
              options: q.options,
              correctAnswer: q.answer,
              selected,
              status,
              marks: q.marks,
              explanation: q.explanation || '',
            };
          });
          // Do not cache mutable live IN_PROGRESS heavily — still ok for submitted
          return {
            attempt: att,
            exam: exam
              ? { id: exam.id, title: exam.title, totalQuestions: exam.totalQuestions }
              : null,
            breakdown,
          };
        }
      );
      res.json(payload);
    } catch (e: any) {
      console.error('[attempt detail]', e?.message || e);
      res.status(500).json({ error: 'Failed to load detail' });
    }
  });

  app.post('/api/students/:id/reset-attempt', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const { examId } = req.body;
    const student = store.getStudentById(req.params.id);
    if (!student || !studentBelongsToTeacher(student, teacherId)) return res.status(404).json({ error: 'Student not found' });
    if (examId && !getOwnedExam(String(examId), teacherId)) return res.status(404).json({ error: 'Exam not found' });

    const attempts = store.getAttempts(examId).filter(a =>
      a.studentId === student.studentId || a.telegramUserId === student.telegramUserId
    );
    for (const att of attempts) await store.deleteAttempt(att.id);

    if (examId) updateExamRanks(examId);

    await store.addAuditLog('ATTEMPT_RESET', `Reset attempt for student ${student.name} on exam ${examId || 'all'}`, teacherId);
    res.json({ success: true, resetCount: attempts.length });
  });

  // 7. Results & CSV Export
  app.get('/api/results', (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const { examId, className } = req.query;
    const myExamIds = new Set(store.getExams().filter((e: any) => e.teacherId === teacherId).map((e: any) => e.id));
    let attempts = store.getAttempts().filter(a => myExamIds.has(a.examId));

    if (examId) {
      if (!myExamIds.has(String(examId))) return res.status(404).json({ error: 'Exam not found' });
      attempts = attempts.filter(a => a.examId === examId);
    }
    if (className) {
      attempts = attempts.filter(a => a.studentClass === className);
    }

    res.json(attempts);
  });

  app.get('/api/results/export', (req, res) => {
    const { examId } = req.query;
    const teacherId = (req as any).teacher?.username as string | undefined;
    const myExamIds = new Set(
      store.getExams().filter((e: any) => !teacherId || e.teacherId === teacherId).map((e: any) => e.id)
    );
    let attempts = store.getAttempts().filter(a => myExamIds.has(a.examId));
    if (examId) {
      if (!myExamIds.has(String(examId))) return res.status(404).json({ error: 'Exam not found' });
      attempts = attempts.filter(a => a.examId === String(examId));
    }

    attempts = attempts
      .filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
      .slice()
      .sort((a, b) => (b.score - a.score) || (a.timeTakenSeconds - b.timeTakenSeconds));
    let csv = 'Rank,Student ID,Student Name,Class,Telegram,Status,Score,Max Score,Percentage,Correct,Wrong,Skipped,Time Taken (sec),Submitted At\n';
    attempts.forEach((a, i) => {
      const stu = store.getStudents().find(s => s.studentId === a.studentId || s.telegramUserId === a.telegramUserId);
      const tg = stu?.telegramUsername || '';
      csv += [
        csvCell(a.rank || i + 1),
        csvCell(a.studentId),
        csvCell(a.studentName),
        csvCell(a.studentClass),
        csvCell(tg),
        csvCell(a.status),
        csvCell(a.score),
        csvCell(a.maxScore),
        csvCell(a.percentage),
        csvCell(a.correctCount),
        csvCell(a.wrongCount),
        csvCell(a.skippedCount),
        csvCell(a.timeTakenSeconds),
        csvCell(a.submittedAt || '')
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=exam_results_${examId || 'all'}.csv`);
    res.send(csv);
  });

  // 8. Leaderboard
  app.get('/api/leaderboard', (req, res) => {
    const { examId } = req.query;
    if (!examId) return res.json([]);

    const exam = store.getExamById(String(examId));
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const attempts = store.getAttempts(exam.id).filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');
    attempts.sort((a, b) => (a.rank || 999) - (b.rank || 999));

    res.json({ exam, leaderboard: attempts });
  });

  // 9. Settings & Audit Logs
  app.get('/api/settings', (req, res) => {
    const s = store.getSettings();
    res.json({ ...s, telegramBotToken: s.telegramBotToken ? '••••••••' : '', botActive: true });
  });

  
  
  app.post('/api/message', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });
    const message = clampStr(req.body?.message, env.maxMessageLength);
    const telegramUserId = Number(req.body?.telegramUserId);
    if (!message) return res.status(400).json({ error: 'Message required' });
    if (!telegramUserId) return res.status(400).json({ error: 'telegramUserId required' });

    // Ensure student belongs to this teacher
    const myExamIds = new Set(store.getExams().filter((e: any) => e.teacherId === teacherId).map((e: any) => e.id));
    const allowed = store.getAttempts().some((a: any) => myExamIds.has(a.examId) && Number(a.telegramUserId) === telegramUserId)
      || store.getStudents().some((s: any) => Number(s.telegramUserId) === telegramUserId && Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId));
    if (!allowed) return res.status(403).json({ error: 'Student not in your class' });

    try {
      await sendTelegramResponse({
        chatId: telegramUserId,
        text: '📢 *Message from teacher*\n\n' + message,
        type: 'sendMessage'
      });
      store.addAuditLog('DM', `Teacher ${teacherId} messaged TG ${telegramUserId}`, teacherId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Send failed' });
    }
  });

  app.post('/api/broadcast', async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message required' });
    if (message.length > 3500) return res.status(400).json({ error: 'Message too long (max 3500)' });

    const myExamIds = new Set(store.getExams().filter((e: any) => e.teacherId === teacherId).map((e: any) => e.id));
    const students = store.getStudents().filter((s: any) => {
      if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
      return store.getAttempts().some((a: any) => myExamIds.has(a.examId) && a.telegramUserId === s.telegramUserId);
    });
    const unique = [...new Set(students.map((s: any) => s.telegramUserId).filter(Boolean))] as number[];

    const jobId = `BCAST_${Date.now()}`;
    enqueueBroadcast({ id: jobId, teacherId, message, recipients: unique });
    res.json({ ok: true, jobId, queued: unique.length, message: 'Broadcast queued — sending in background' });
  });

  app.put('/api/settings', (req, res) => {
    const body = { ...req.body };
    delete body.telegramBotToken;
    delete body.botUsername;
    delete body.webhookUrl;
    const updated = store.updateSettings(body);
    store.addAuditLog('SETTINGS_UPDATED', 'Updated teacher settings');
    res.json(updated);
  });

  app.get('/api/audit-logs', (req, res) => {
    res.json(store.getAuditLogs());
  });

  app.post('/api/seed', (req, res) => {
    if (!env.enableDangerousReseed) {
      return res.status(403).json({ error: 'Seed/reset disabled' });
    }
    const fresh = store.resetToSeed();
    store.addAuditLog('SYSTEM_RESEEDED', 'Reseeded database to default state');
    res.json(fresh);
  });

  // 10. Telegram Webhook & In-Dashboard Simulator
  app.post('/api/telegram/simulate', async (req, res) => {
    if (env.isProd) {
      return res.status(403).json({ error: 'Simulator disabled in production' });
    }
    try {
      const update = req.body;
      const result = await processTelegramUpdate(update);
      res.json(result || { status: 'ignored' });
    } catch (err: any) {
      console.error('Telegram simulation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telegram/webhook', async (req, res) => {
    try {
      if (env.telegramWebhookSecret) {
        const hdr = String(req.headers['x-telegram-bot-api-secret-token'] || '');
        if (hdr !== env.telegramWebhookSecret) {
          return res.status(401).json({ error: 'Invalid webhook secret' });
        }
      }
      const update = req.body;
      const result = await processTelegramUpdate(update);
      if (result) {
        await sendTelegramResponse(result);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Telegram webhook error:', err);
      res.status(200).json({ ok: true });
    }
  });

  // Routes registered; caller starts listen + polling
  return app;
}


export { startServer };
