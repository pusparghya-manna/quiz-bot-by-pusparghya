import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db.js';
import { loginTeacher, registerTeacher, authMiddleware, ensureTeachersTable } from './auth.js';
import { store } from './store.js';
import { processTelegramUpdate, updateExamRanks, calculateAttemptScore, sendTelegramResponse } from './telegramBot.js';
import { startTelegramPolling } from './telegramPolling.js';
import { parseQuestionsFromMedia } from './geminiOcr.js';
import { Exam, Question, Student } from './types.js';
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Auth
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      const result = await loginTeacher(username, password);
      res.json(result);
    } catch (e: any) {
      res.status(401).json({ error: e.message || 'Login failed' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
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

  // 1. Dashboard Overview Stats & Complete Data Batch
  app.get('/api/data', (req, res) => {
    const teacher = (req as any).teacher;
    const teacherId = teacher?.username as string | undefined;
    // Strict isolation: only this teacher's exams
    let exams = store.getExams();
    if (teacherId) {
      exams = exams.filter((e: any) => e.teacherId === teacherId);
    } else {
      exams = [];
    }
    const examIds = new Set(exams.map((e: any) => e.id));
    const attempts = store.getAttempts().filter((a: any) => examIds.has(a.examId));
    // Students linked to this teacher only
    let students = store.getStudents();
    if (teacherId) {
      students = students.filter((s: any) => {
        if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
        // also include if they have an attempt on this teacher's exam
        return attempts.some((a: any) =>
          a.studentId === s.studentId || (s.telegramUserId && a.telegramUserId === s.telegramUserId)
        );
      });
      // dedupe by telegram id
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
    // Shared bot settings (token from env preferred)
    const settings = { ...store.getSettings() };
    if (process.env.TELEGRAM_BOT_TOKEN) settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    res.json({
      exams,
      questions: [], // question bank not shared across teachers
      students,
      attempts,
      settings,
      auditLogs: store.getAuditLogs().filter((l: any) => !teacherId || (l.details || '').includes(teacherId) || l.actor === teacherId).slice(0, 30)
    });
  });

  app.post('/api/reseed', (req, res) => {
    const fresh = store.resetToSeed();
    store.addAuditLog('SYSTEM_RESEEDED', 'Reseeded database to clean state');
    res.json(fresh);
  });

  app.get('/api/stats', (req, res) => {
    const exams = store.getExams();
    const students = store.getStudents();
    const attempts = store.getAttempts();

    const activeExamsCount = exams.filter(e => e.status === 'LIVE' || e.status === 'SCHEDULED').length;
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
  app.get('/api/exams', (req, res) => {
    let exams = store.getExams();
    const { className, status } = req.query;

    if (className) {
      exams = exams.filter(e => e.className === className);
    }
    if (status) {
      exams = exams.filter(e => e.status === status);
    }

    res.json(exams);
  });

  app.get('/api/exams/:id', (req, res) => {
    const exam = store.getExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    const attempts = store.getAttempts(exam.id);
    res.json({ exam, attempts });
  });

  app.post('/api/exams', (req, res) => {
    const data = req.body;
    const now = new Date().toISOString();

    const teacher = (req as any).teacher;
    const newExam: Exam = {
      id: `EXAM_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      teacherId: teacher?.username || data.teacherId,
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
      status: data.status || 'DRAFT',
      questions: data.questions || [],
      createdAt: now,
      updatedAt: now
    };

    store.saveExam(newExam);
    store.addAuditLog('EXAM_CREATED', `Created exam "${newExam.title}" for ${newExam.className}`);
    res.json(newExam);
  });

  app.put('/api/exams/:id', (req, res) => {
    const exam = store.getExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    const teacher = (req as any).teacher;
    if (exam.teacherId && teacher?.username && exam.teacherId !== teacher.username) {
      return res.status(403).json({ error: 'Not your exam' });
    }

    const updated: Exam = {
      ...exam,
      ...req.body,
      teacherId: exam.teacherId || (req as any).teacher?.username,
      totalQuestions: req.body.questions ? req.body.questions.length : exam.totalQuestions,
      updatedAt: new Date().toISOString()
    };

    store.saveExam(updated);
    store.addAuditLog('EXAM_UPDATED', `Updated exam "${updated.title}" (${updated.status})`);
    res.json(updated);
  });

  app.delete('/api/exams/:id', (req, res) => {
    const exam = store.getExamById(req.params.id);
    if (exam) {
      const teacher = (req as any).teacher;
      if (exam.teacherId && teacher?.username && exam.teacherId !== teacher.username) {
        return res.status(403).json({ error: 'Not your exam' });
      }
      store.deleteExam(req.params.id);
      store.addAuditLog('EXAM_DELETED', `Deleted exam "${exam.title}"`);
      return res.json({ success: true });
    }
    res.status(404).json({ error: 'Exam not found' });
  });

  app.post('/api/exams/:id/recalculate', (req, res) => {
    const exam = store.getExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const attempts = store.getAttempts(exam.id);
    attempts.forEach((att) => {
      const stats = calculateAttemptScore(exam, att.answers, att.timeTakenSeconds);
      att.score = stats.score;
      att.maxScore = stats.maxScore;
      att.percentage = stats.percentage;
      att.correctCount = stats.correctCount;
      att.wrongCount = stats.wrongCount;
      att.skippedCount = stats.skippedCount;
      store.saveAttempt(att);
    });

    updateExamRanks(exam.id);
    store.addAuditLog('EXAM_RECALCULATED', `Recalculated scores and rankings for ${exam.title}`);
    res.json({ success: true, count: attempts.length });
  });

  // 3. Question Bank
  app.get('/api/questions', (req, res) => {
    res.json(store.getQuestionBank());
  });

  app.post('/api/questions', (req, res) => {
    const qData = req.body;
    const newQuestion: Question = {
      id: `QB_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      question: qData.question,
      options: qData.options || ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: qData.answer !== undefined ? qData.answer : null,
      marks: Number(qData.marks) || 1,
      negativeMarks: Number(qData.negativeMarks) || 0,
      subject: qData.subject || 'General',
      explanation: qData.explanation
    };

    store.saveQuestion(newQuestion);
    store.addAuditLog('QUESTION_ADDED', `Added question to bank: "${newQuestion.question.substring(0, 40)}..."`);
    res.json(newQuestion);
  });

  app.put('/api/questions/:id', (req, res) => {
    const q = store.getQuestionBank().find(item => item.id === req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    const updated = { ...q, ...req.body };
    store.saveQuestion(updated);
    res.json(updated);
  });

  app.delete('/api/questions/:id', (req, res) => {
    store.deleteQuestion(req.params.id);
    res.json({ success: true });
  });

  // 4. JSON Import
  app.post('/api/questions/import-json', (req, res) => {
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Payload must contain a "questions" array.' });
    }

    const imported: Question[] = [];
    questions.forEach((q: any, idx: number) => {
      const formatted: Question = {
        id: `QB_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: q.answer !== undefined && q.answer !== null ? Number(q.answer) : null,
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        subject: q.subject || 'General'
      };
      store.saveQuestion(formatted);
      imported.push(formatted);
    });

    store.addAuditLog('JSON_IMPORTED', `Imported ${imported.length} questions via JSON format`);
    res.json({ success: true, count: imported.length, questions: imported });
  });

  // 5. OCR Import via Gemini 3.6 Flash
  app.post('/api/ocr/parse', async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
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

  app.post('/api/students', (req, res) => {
    const data = req.body;
    const newStudent: Student = {
      id: `STU_${Date.now()}`,
      studentId: data.studentId || `2026-${Date.now()}`,
      name: data.name || 'New Student',
      className: data.className || 'Class 10-A Biology',
      telegramUserId: data.telegramUserId ? Number(data.telegramUserId) : null,
      telegramUsername: data.telegramUsername || null,
      linkCode: `LINK-${Math.floor(10000 + Math.random() * 90000)}`,
      status: data.telegramUserId ? 'linked' : 'unlinked'
    };

    store.saveStudent(newStudent);
    store.addAuditLog('STUDENT_CREATED', `Added student ${newStudent.name} (${newStudent.studentId})`);
    res.json(newStudent);
  });

  app.put('/api/students/:id', (req, res) => {
    const student = store.getStudentById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const updated = { ...student, ...req.body };
    store.saveStudent(updated);
    res.json(updated);
  });

  app.delete('/api/students/:id', (req, res) => {
    const student = store.getStudentById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    // collect exam ids for re-rank
    const examIds = [...new Set(store.getAttempts().filter(a =>
      a.studentId === student.studentId || a.telegramUserId === student.telegramUserId
    ).map(a => a.examId))];
    store.deleteStudent(student.id);
    examIds.forEach(id => updateExamRanks(id));
    store.addAuditLog('STUDENT_DELETED', `Removed student ${student.name}`);
    res.json({ success: true });
  });

  app.delete('/api/attempts/:id', (req, res) => {
    const att = store.getAttempts().find(a => a.id === req.params.id);
    if (!att) return res.status(404).json({ error: 'Attempt not found' });
    store.deleteAttempt(att.id);
    updateExamRanks(att.examId);
    store.addAuditLog('ATTEMPT_DELETED', `Removed attempt ${att.id} for ${att.studentName}`);
    res.json({ success: true });
  });

  app.get('/api/attempts/:id/detail', (req, res) => {
    const att = store.getAttempts().find(a => a.id === req.params.id);
    if (!att) return res.status(404).json({ error: 'Attempt not found' });
    const exam = store.getExamById(att.examId);
    const breakdown = (exam?.questions || []).map((q, idx) => {
      const selected = att.answers[q.id];
      const has = selected !== undefined && selected !== null;
      let status: 'correct' | 'wrong' | 'skipped' = 'skipped';
      if (has) {
        status = (q.answer !== null && selected === q.answer) ? 'correct' : 'wrong';
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
        explanation: q.explanation || ''
      };
    });
    res.json({ attempt: att, exam: exam ? { id: exam.id, title: exam.title, totalQuestions: exam.totalQuestions } : null, breakdown });
  });

  app.post('/api/students/:id/reset-attempt', (req, res) => {
    const { examId } = req.body;
    const student = store.getStudentById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const attempts = store.getAttempts(examId).filter(a => a.studentId === student.studentId);
    attempts.forEach(att => store.deleteAttempt(att.id));

    if (examId) updateExamRanks(examId);

    store.addAuditLog('ATTEMPT_RESET', `Reset attempt for student ${student.name} on exam ${examId || 'all'}`);
    res.json({ success: true, resetCount: attempts.length });
  });

  // 7. Results & CSV Export
  app.get('/api/results', (req, res) => {
    const { examId, className } = req.query;
    let attempts = store.getAttempts();

    if (examId) {
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
      csv += `"${a.rank || i + 1}","${a.studentId}","${a.studentName}","${a.studentClass}","${tg}","${a.status}",${a.score},${a.maxScore},${a.percentage},${a.correctCount},${a.wrongCount},${a.skippedCount},${a.timeTakenSeconds},"${a.submittedAt || ''}"\n`;
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
    res.json(store.getSettings());
  });

  
  
  app.post('/api/message', async (req, res) => {
    const teacherId = (req as any).teacher?.username as string | undefined;
    if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });
    const message = String(req.body?.message || '').trim();
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
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message required' });
    const teacherId = (req as any).teacher?.username as string | undefined;
    if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });

    // Only students belonging to this teacher
    const myExamIds = new Set(store.getExams().filter((e: any) => e.teacherId === teacherId).map((e: any) => e.id));
    const myAttempts = store.getAttempts().filter((a: any) => myExamIds.has(a.examId));
    const tgIds = new Set<number>();
    for (const a of myAttempts) {
      if (a.telegramUserId) tgIds.add(Number(a.telegramUserId));
    }
    const students = store.getStudents().filter((s: any) => {
      if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
      return s.telegramUserId && tgIds.has(Number(s.telegramUserId));
    });
    const seen = new Set<number>();
    const unique = students.filter((s: any) => {
      const id = Number(s.telegramUserId);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    let sent = 0;
    let failed = 0;
    for (const s of unique) {
      try {
        await sendTelegramResponse({
          chatId: s.telegramUserId!,
          text: '📢 *Message from teacher*\n\n' + message,
          type: 'sendMessage'
        });
        sent++;
      } catch {
        failed++;
      }
    }
    store.addAuditLog('BROADCAST', `Teacher ${teacherId} broadcast to ${sent} students`, teacherId);
    res.json({ sent, failed, total: unique.length });
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
    const fresh = store.resetToSeed();
    store.addAuditLog('SYSTEM_RESEEDED', 'Reseeded database to default state');
    res.json(fresh);
  });

  // 10. Telegram Webhook & In-Dashboard Simulator
  app.post('/api/telegram/simulate', async (req, res) => {
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
      const update = req.body;
      const result = await processTelegramUpdate(update);
      if (result) {
        await sendTelegramResponse(result);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Telegram webhook error:', err);
      res.status(200).json({ ok: true }); // Return 200 OK to Telegram webhook always
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quiz Bot API running on port ${PORT}`);
    startTelegramPolling();
  });
}

async function main() {
  await initDb();
  await ensureTeachersTable();
  await store.init();
  await startServer();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});