/**
 * Production store: normalized SQL is source of truth.
 * Startup loads from SQL tables (not JSON blobs). Writes persist to SQL.
 * Legacy app_data blobs are left intact for rollback until migration is verified.
 */
import { db } from './db.js';
import { Exam, Question, Student, Attempt, AuditLog, SystemSettings } from './types.js';
import { ensureSchema, runBlobMigration } from './database/migrateFromBlobs.js';
import { effectiveExamStatus } from './examStatus.js';

function generateInitialSettings(): SystemSettings {
  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookUrl: '',
    botUsername: '@quizbotbypusparghya_bot',
    botActive: true,
    autoPublishResults: true,
    systemNotice: 'System ready for exam setup.',
  };
}

class Store {
  private data = {
    exams: [] as Exam[],
    questionBank: [] as Question[],
    students: [] as Student[],
    attempts: [] as Attempt[],
    auditLogs: [] as AuditLog[],
    settings: generateInitialSettings(),
  };
  private ready = false;
  private schemaVersion = '1-blob';

  async init() {
    try {
      await ensureSchema();

      // Load whatever is already in normalized tables first (fast path)
      await this.loadFromSql();
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      }

      // If normalized tables empty but legacy blobs exist, migrate with a hard timeout
      // so Railway boot is never stuck on row-by-row Turso writes forever.
      const examCount = await db.execute('SELECT COUNT(*) as c FROM exams');
      const nExams = Number((examCount.rows[0] as any)?.c || 0);
      if (nExams === 0) {
        const blobExams = await db
          .execute({ sql: `SELECT data FROM app_data WHERE key = 'exams' LIMIT 1`, args: [] })
          .catch(() => ({ rows: [] as any[] }));
        if (blobExams.rows.length > 0) {
          console.log('[migration] Normalized tables empty — blob → SQL migration (max 90s)…');
          try {
            const report = await Promise.race([
              runBlobMigration(),
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error('migration timed out after 90s')), 90_000)
              ),
            ]);
            console.log('[migration] report', JSON.stringify(report));
            await this.loadFromSql();
          } catch (migErr: any) {
            console.error('[migration] deferred/failed:', migErr?.message || migErr);
            console.error('[migration] App continues; re-run npm run db:migrate offline if needed.');
          }
        }
      }

      this.ready = true;
      console.log(
        `Store loaded from SQL: exams=${this.data.exams.length} students=${this.data.students.length} attempts=${this.data.attempts.length}`
      );
    } catch (e) {
      console.error('Store init error', e);
      const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
      if (isProd) {
        this.ready = false;
        throw e;
      }
      this.ready = true;
    }
  }

  isReady() {
    return this.ready;
  }


  private async loadFromSql() {
    const [sres, eres, sstud, ares, lres, qb] = await Promise.all([
      db.execute('SELECT * FROM system_settings WHERE id = 1'),
      db.execute('SELECT * FROM exams ORDER BY created_at DESC'),
      db.execute('SELECT * FROM students'),
      db.execute('SELECT * FROM attempts'),
      db.execute('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200'),
      db.execute('SELECT * FROM question_bank'),
    ]);

    if (sres.rows.length) {
      const r = sres.rows[0] as any;
      this.data.settings = {
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || r.telegram_bot_token || '',
        webhookUrl: r.webhook_url || '',
        botUsername: r.bot_username || '@quizbotbypusparghya_bot',
        botActive: Boolean(r.bot_active),
        autoPublishResults: Boolean(r.auto_publish_results),
        systemNotice: r.system_notice || '',
      };
    }

    const exams: Exam[] = [];
    for (const r of eres.rows as any[]) {
      const qres = await db.execute({
        sql: 'SELECT * FROM questions WHERE exam_id = ? ORDER BY sort_order ASC',
        args: [r.id],
      });
      const questions = (qres.rows as any[]).map((q) => ({
        id: String(q.id),
        question: q.question,
        options: JSON.parse(String(q.options_json || '[]')),
        answer: q.answer === null || q.answer === undefined ? null : Number(q.answer),
        marks: Number(q.marks ?? 1),
        negativeMarks: Number(q.negative_marks ?? 0),
        explanation: q.explanation || undefined,
        subject: q.subject || undefined,
      }));
      exams.push({
        id: String(r.id),
        teacherId: r.teacher_id || undefined,
        title: r.title,
        subject: r.subject || '',
        className: r.class_name || '',
        testNumber: r.test_number || '',
        totalQuestions: Number(r.total_questions || questions.length),
        startDate: r.start_date,
        durationMinutes: Number(r.duration_minutes || 60),
        totalMarks: Number(r.total_marks || 0),
        negativeMarking: Number(r.negative_marking || 0),
        randomizeQuestions: Boolean(r.randomize_questions),
        randomizeOptions: Boolean(r.randomize_options),
        resultVisibility: (r.result_visibility || 'PUBLISHED') as any,
        leaderboardVisibility: (r.leaderboard_visibility || 'PUBLISHED') as any,
        status: effectiveExamStatus({ startDate: r.start_date, durationMinutes: Number(r.duration_minutes || 60) }),
        questions,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } as Exam);
    }
    this.data.exams = exams;

    const students: Student[] = [];
    for (const r of sstud.rows as any[]) {
      const tres = await db.execute({
        sql: 'SELECT teacher_id FROM student_teachers WHERE student_id = ?',
        args: [r.id],
      });
      students.push({
        id: String(r.id),
        studentId: r.student_code,
        name: r.name,
        className: r.class_name || 'ALL',
        telegramUserId: r.telegram_user_id != null ? Number(r.telegram_user_id) : undefined,
        telegramUsername: r.telegram_username || undefined,
        linkCode: r.link_code || undefined,
        status: (r.status || 'linked') as any,
        linkedAt: r.linked_at || undefined,
        teacherIds: (tres.rows as any[]).map((x) => String(x.teacher_id)),
      } as Student);
    }
    this.data.students = students;

    const attempts: Attempt[] = [];
    for (const r of ares.rows as any[]) {
      const status = String(r.status);
      let answers: Record<string, number> = {};
      // Load answer maps only for in-progress attempts (needed for resume).
      // Submitted attempts load answers on demand in detail endpoints.
      if (status === 'IN_PROGRESS') {
        const ans = await db.execute({
          sql: 'SELECT question_id, option_index FROM attempt_answers WHERE attempt_id = ?',
          args: [r.id],
        });
        for (const a of ans.rows as any[]) {
          answers[String(a.question_id)] = Number(a.option_index);
        }
      }
      attempts.push({
        id: String(r.id),
        examId: String(r.exam_id),
        studentId: r.student_id || '',
        telegramUserId: Number(r.telegram_user_id),
        studentName: r.student_name || '',
        studentClass: r.student_class || '',
        startedAt: r.started_at,
        expiresAt: r.expires_at,
        submittedAt: r.submitted_at || undefined,
        status: status as any,
        answers,
        currentQuestionIndex: Number(r.current_question_index || 0),
        score: Number(r.score || 0),
        maxScore: Number(r.max_score || 0),
        percentage: Number(r.percentage || 0),
        correctCount: Number(r.correct_count || 0),
        wrongCount: Number(r.wrong_count || 0),
        skippedCount: Number(r.skipped_count || 0),
        timeTakenSeconds: Number(r.time_taken_seconds || 0),
        rank: r.rank == null ? undefined : Number(r.rank),
        isOfficial: r.is_official === undefined ? true : Boolean(r.is_official),
        attemptNumber: Number(r.attempt_number || 1),
      } as Attempt);
    }
    this.data.attempts = attempts;

    this.data.auditLogs = (lres.rows as any[]).map((r) => ({
      id: String(r.id),
      timestamp: r.timestamp,
      action: r.action,
      details: r.details || '',
      actor: r.actor || 'system',
    }));

    this.data.questionBank = (qb.rows as any[]).map((q) => ({
      id: String(q.id),
      teacherId: q.teacher_id || undefined,
      question: q.question,
      options: JSON.parse(String(q.options_json || '[]')),
      answer: q.answer === null || q.answer === undefined ? null : Number(q.answer),
      marks: Number(q.marks ?? 1),
      negativeMarks: Number(q.negative_marks ?? 0),
      explanation: q.explanation || undefined,
      subject: q.subject || undefined,
    }));
  }

  /** Load answers for an attempt from SQL (for detail / scoring). */
  async loadAttemptAnswers(attemptId: string): Promise<Record<string, number>> {
    const ans = await db.execute({
      sql: 'SELECT question_id, option_index FROM attempt_answers WHERE attempt_id = ?',
      args: [attemptId],
    });
    const answers: Record<string, number> = {};
    for (const a of ans.rows as any[]) {
      answers[String(a.question_id)] = Number(a.option_index);
    }
    const att = this.data.attempts.find((x) => x.id === attemptId);
    if (att) att.answers = answers;
    return answers;
  }


  private async persistExam(exam: Exam) {
    const status = effectiveExamStatus(exam);
    await db.execute({
      sql: `INSERT INTO exams (id, teacher_id, title, subject, class_name, test_number, total_questions,
            start_date, duration_minutes, total_marks, negative_marking, randomize_questions, randomize_options,
            result_visibility, leaderboard_visibility, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, subject=excluded.subject, class_name=excluded.class_name,
              test_number=excluded.test_number, total_questions=excluded.total_questions, start_date=excluded.start_date,
              duration_minutes=excluded.duration_minutes, total_marks=excluded.total_marks,
              negative_marking=excluded.negative_marking, randomize_questions=excluded.randomize_questions,
              randomize_options=excluded.randomize_options, result_visibility=excluded.result_visibility,
              leaderboard_visibility=excluded.leaderboard_visibility, status=excluded.status, updated_at=excluded.updated_at,
              teacher_id=excluded.teacher_id`,
      args: [
        exam.id, exam.teacherId || 'default', exam.title, exam.subject || null, exam.className || null,
        exam.testNumber || null, exam.questions?.length ?? exam.totalQuestions ?? 0, exam.startDate,
        exam.durationMinutes || 60, exam.totalMarks || 0, exam.negativeMarking || 0,
        exam.randomizeQuestions ? 1 : 0, exam.randomizeOptions ? 1 : 0,
        exam.resultVisibility || 'PUBLISHED', exam.leaderboardVisibility || 'PUBLISHED', status,
        exam.createdAt || new Date().toISOString(), new Date().toISOString(),
      ],
    });
    await db.execute({ sql: 'DELETE FROM questions WHERE exam_id = ?', args: [exam.id] });
    for (let i = 0; i < (exam.questions || []).length; i++) {
      const q = exam.questions[i];
      await db.execute({
        sql: `INSERT INTO questions (id, exam_id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject, sort_order)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          q.id, exam.id, exam.teacherId || null, q.question, JSON.stringify(q.options || []),
          q.answer, q.marks ?? 1, q.negativeMarks ?? 0, q.explanation || null, q.subject || null, i,
        ],
      });
    }
  }

  private async persistStudent(student: Student) {
    await db.execute({
      sql: `INSERT INTO students (id, student_code, name, class_name, telegram_user_id, telegram_username, link_code, status, linked_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, student_code=excluded.student_code,
              class_name=excluded.class_name, telegram_user_id=excluded.telegram_user_id,
              telegram_username=excluded.telegram_username, link_code=excluded.link_code,
              status=excluded.status, linked_at=excluded.linked_at`,
      args: [
        student.id, student.studentId, student.name, student.className || null,
        student.telegramUserId, student.telegramUsername, student.linkCode || null,
        student.status, student.linkedAt || null,
      ],
    });
    for (const tid of student.teacherIds || []) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)',
        args: [student.id, tid],
      });
    }
  }

  private async persistAttempt(attempt: Attempt) {
    await db.execute({
      sql: `INSERT INTO attempts (id, exam_id, student_id, telegram_user_id, student_name, student_class,
            started_at, expires_at, submitted_at, status, current_question_index, score, max_score, percentage,
            correct_count, wrong_count, skipped_count, time_taken_seconds, rank, is_official, attempt_number)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status, score=excluded.score, max_score=excluded.max_score,
              percentage=excluded.percentage, submitted_at=excluded.submitted_at, rank=excluded.rank,
              correct_count=excluded.correct_count, wrong_count=excluded.wrong_count, skipped_count=excluded.skipped_count,
              time_taken_seconds=excluded.time_taken_seconds, current_question_index=excluded.current_question_index,
              student_name=excluded.student_name, is_official=excluded.is_official, attempt_number=excluded.attempt_number`,
      args: [
        attempt.id, attempt.examId, attempt.studentId || null, attempt.telegramUserId,
        attempt.studentName || null, attempt.studentClass || null, attempt.startedAt, attempt.expiresAt,
        attempt.submittedAt, attempt.status, attempt.currentQuestionIndex || 0, attempt.score || 0,
        attempt.maxScore || 0, attempt.percentage || 0, attempt.correctCount || 0, attempt.wrongCount || 0,
        attempt.skippedCount || 0, attempt.timeTakenSeconds || 0, attempt.rank ?? null,
        attempt.isOfficial === false ? 0 : 1, attempt.attemptNumber || 1,
      ],
    });
    const answers = attempt.answers || {};
    // Only rewrite answer rows when we have answer payload (avoid wiping on rank-only saves)
    if (Object.keys(answers).length > 0 || attempt.status === 'IN_PROGRESS') {
      await db.execute({ sql: 'DELETE FROM attempt_answers WHERE attempt_id = ?', args: [attempt.id] });
      for (const [qid, opt] of Object.entries(answers)) {
        await db.execute({
          sql: 'INSERT OR REPLACE INTO attempt_answers (attempt_id, question_id, option_index) VALUES (?,?,?)',
          args: [attempt.id, qid, Number(opt)],
        });
      }
    }
  }

  getExams() {
    return this.data.exams.map((e) => ({ ...e, status: effectiveExamStatus(e) }));
  }
  getExamById(id: string) {
    const e = this.data.exams.find((x) => x.id === id || x.id.toLowerCase() === id.toLowerCase());
    return e ? { ...e, status: effectiveExamStatus(e) } : undefined;
  }
  async saveExam(exam: Exam) {
    exam.status = effectiveExamStatus(exam);
    exam.updatedAt = new Date().toISOString();
    const idx = this.data.exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) this.data.exams[idx] = exam;
    else this.data.exams.unshift(exam);
    await this.persistExam(exam);
    return exam;
  }
  async deleteExam(id: string) {
    this.data.exams = this.data.exams.filter((e) => e.id !== id);
    this.data.attempts = this.data.attempts.filter((a) => a.examId !== id);
    await db.execute({ sql: 'DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = ?)', args: [id] });
    await db.execute({ sql: 'DELETE FROM attempts WHERE exam_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM questions WHERE exam_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM exams WHERE id = ?', args: [id] });
  }

  getStudents() { return this.data.students; }
  getStudentById(id: string) { return this.data.students.find((s) => s.id === id); }
  getStudentByTelegramId(tg: number) {
    return this.data.students.find((s) => s.telegramUserId === tg);
  }
  async saveStudent(student: Student) {
    const idx = this.data.students.findIndex((s) => s.id === student.id);
    if (idx >= 0) this.data.students[idx] = student;
    else this.data.students.push(student);
    await this.persistStudent(student);
    return student;
  }
  async deleteStudent(id: string) {
    this.data.students = this.data.students.filter((s) => s.id !== id);
    await db.execute({ sql: 'DELETE FROM student_teachers WHERE student_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM students WHERE id = ?', args: [id] });
  }

  getAttempts(examId?: string) {
    return examId ? this.data.attempts.filter((a) => a.examId === examId) : this.data.attempts;
  }
  getStudentAttempts(examId: string, telegramUserId: number) {
    return this.data.attempts
      .filter((a) => a.examId === examId && a.telegramUserId === telegramUserId)
      .sort((a, b) => (a.attemptNumber || 1) - (b.attemptNumber || 1));
  }
  getAttempt(examId: string, telegramUserId: number) {
    const mine = this.getStudentAttempts(examId, telegramUserId);
    return mine.find((a) => a.status === 'IN_PROGRESS') || mine[mine.length - 1];
  }
  async deleteAttempt(id: string) {
    this.data.attempts = this.data.attempts.filter((a) => a.id !== id);
    await db.execute({ sql: 'DELETE FROM attempt_answers WHERE attempt_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM attempts WHERE id = ?', args: [id] });
  }
  async saveAttempt(attempt: Attempt) {
    const idx = this.data.attempts.findIndex((a) => a.id === attempt.id);
    if (idx >= 0) this.data.attempts[idx] = attempt;
    else this.data.attempts.push(attempt);
    await this.persistAttempt(attempt);
    return attempt;
  }
  hasOfficialAttempt(examId: string, telegramUserId: number) {
    return this.getStudentAttempts(examId, telegramUserId).some(
      (a) => a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED' || a.status === 'IN_PROGRESS')
    );
  }

  getQuestionBank() { return this.data.questionBank; }
  async saveQuestion(q: Question) {
    const idx = this.data.questionBank.findIndex((x) => x.id === q.id);
    if (idx >= 0) this.data.questionBank[idx] = q;
    else this.data.questionBank.push(q);
    await db.execute({
      sql: `INSERT INTO question_bank (id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json`,
      args: [
        q.id, q.teacherId || 'default', q.question, JSON.stringify(q.options || []),
        q.answer, q.marks ?? 1, q.negativeMarks ?? 0, q.explanation || null, q.subject || null,
      ],
    });
    return q;
  }
  async deleteQuestion(id: string) {
    this.data.questionBank = this.data.questionBank.filter((q) => q.id !== id);
    await db.execute({ sql: 'DELETE FROM question_bank WHERE id = ?', args: [id] });
  }

  getSettings() { return this.data.settings; }
  async updateSettings(partial: Partial<SystemSettings>) {
    this.data.settings = { ...this.data.settings, ...partial };
    if (process.env.TELEGRAM_BOT_TOKEN) this.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    await db.execute({
      sql: `INSERT INTO system_settings (id, bot_username, system_notice, bot_active, auto_publish_results, webhook_url, telegram_bot_token)
            VALUES (1,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET bot_username=excluded.bot_username, system_notice=excluded.system_notice,
              bot_active=excluded.bot_active, auto_publish_results=excluded.auto_publish_results, webhook_url=excluded.webhook_url`,
      args: [
        this.data.settings.botUsername, this.data.settings.systemNotice || '',
        this.data.settings.botActive ? 1 : 0, this.data.settings.autoPublishResults ? 1 : 0,
        this.data.settings.webhookUrl || '', '',
      ],
    });
    return this.data.settings;
  }

  getAuditLogs() { return this.data.auditLogs; }
  async addAuditLog(action: string, details: string, actor = 'system') {
    const log: AuditLog = {
      id: `LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action,
      details,
      actor,
    };
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) this.data.auditLogs.length = 500;
    await db.execute({
      sql: 'INSERT INTO audit_logs (id, timestamp, action, details, actor, teacher_id) VALUES (?,?,?,?,?,?)',
      args: [log.id, log.timestamp, log.action, log.details, log.actor, null],
    });
  }

  async resetToSeed() {
    return this.data;
  }
}

export const store = new Store();
