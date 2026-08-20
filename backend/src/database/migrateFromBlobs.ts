/**
 * Idempotent migration: app_data JSON blobs → normalized tables.
 * Does NOT delete app_data. Creates app_data_backup snapshot first.
 */
import { db } from '../db.js';
import { SCHEMA_SQL } from './schema.js';

type BlobRow = { teacher_id: string; key: string; data: string; updated_at: string };

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function ensureSchema(): Promise<void> {
  for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
}

async function backupBlobs(): Promise<number> {
  const res = await db.execute('SELECT teacher_id, key, data, updated_at FROM app_data');
  const now = new Date().toISOString();
  let n = 0;
  for (const row of res.rows as any[]) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_data_backup (teacher_id, key, data, updated_at, backed_up_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [row.teacher_id, row.key, row.data, row.updated_at, now],
    });
    n++;
  }
  return n;
}

async function migrateExams(teacherKey: string, exams: any[]): Promise<number> {
  let n = 0;
  for (const e of exams || []) {
    const teacherId = e.teacherId || teacherKey || 'default';
    await db.execute({
      sql: `INSERT INTO exams (id, teacher_id, title, subject, class_name, test_number, total_questions,
            start_date, duration_minutes, total_marks, negative_marking, randomize_questions, randomize_options,
            result_visibility, leaderboard_visibility, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title, subject=excluded.subject, class_name=excluded.class_name,
              test_number=excluded.test_number, total_questions=excluded.total_questions,
              start_date=excluded.start_date, duration_minutes=excluded.duration_minutes,
              total_marks=excluded.total_marks, negative_marking=excluded.negative_marking,
              randomize_questions=excluded.randomize_questions, randomize_options=excluded.randomize_options,
              result_visibility=excluded.result_visibility, leaderboard_visibility=excluded.leaderboard_visibility,
              status=excluded.status, updated_at=excluded.updated_at, teacher_id=excluded.teacher_id`,
      args: [
        e.id, teacherId, e.title || 'Exam', e.subject || null, e.className || null, e.testNumber || null,
        e.totalQuestions ?? (e.questions?.length || 0), e.startDate, e.durationMinutes || 60,
        e.totalMarks || 0, e.negativeMarking || 0, e.randomizeQuestions ? 1 : 0, e.randomizeOptions ? 1 : 0,
        e.resultVisibility || 'PUBLISHED', e.leaderboardVisibility || 'PUBLISHED', e.status || 'SCHEDULED',
        e.createdAt || new Date().toISOString(), e.updatedAt || new Date().toISOString(),
      ],
    });
    // Replace questions for this exam (idempotent)
    await db.execute({ sql: 'DELETE FROM questions WHERE exam_id = ?', args: [e.id] });
    const qs = e.questions || [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      await db.execute({
        sql: `INSERT INTO questions (id, exam_id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject, sort_order)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json,
                answer=excluded.answer, marks=excluded.marks, negative_marks=excluded.negative_marks,
                explanation=excluded.explanation, subject=excluded.subject, sort_order=excluded.sort_order`,
        args: [
          q.id, e.id, teacherId, q.question || '', JSON.stringify(q.options || []),
          q.answer ?? null, q.marks ?? 1, q.negativeMarks ?? 0, q.explanation || null, q.subject || null, i,
        ],
      });
    }
    n++;
  }
  return n;
}

async function migrateStudents(students: any[]): Promise<number> {
  let n = 0;
  for (const s of students || []) {
    await db.execute({
      sql: `INSERT INTO students (id, student_code, name, class_name, telegram_user_id, telegram_username, link_code, status, linked_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, telegram_user_id=excluded.telegram_user_id,
              telegram_username=excluded.telegram_username, status=excluded.status, linked_at=excluded.linked_at,
              student_code=excluded.student_code, class_name=excluded.class_name, link_code=excluded.link_code`,
      args: [
        s.id, s.studentId || s.id, s.name || 'Student', s.className || null,
        s.telegramUserId ?? null, s.telegramUsername || null, s.linkCode || null,
        s.status || 'linked', s.linkedAt || null,
      ],
    });
    const tids: string[] = Array.isArray(s.teacherIds) ? s.teacherIds : [];
    for (const tid of tids) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)`,
        args: [s.id, tid],
      });
    }
    n++;
  }
  return n;
}

async function migrateAttempts(attempts: any[]): Promise<number> {
  let n = 0;
  for (const a of attempts || []) {
    await db.execute({
      sql: `INSERT INTO attempts (id, exam_id, student_id, telegram_user_id, student_name, student_class,
            started_at, expires_at, submitted_at, status, current_question_index, score, max_score, percentage,
            correct_count, wrong_count, skipped_count, time_taken_seconds, rank, is_official, attempt_number)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status, score=excluded.score, max_score=excluded.max_score,
              percentage=excluded.percentage, submitted_at=excluded.submitted_at, rank=excluded.rank,
              correct_count=excluded.correct_count, wrong_count=excluded.wrong_count, skipped_count=excluded.skipped_count,
              time_taken_seconds=excluded.time_taken_seconds, current_question_index=excluded.current_question_index,
              is_official=excluded.is_official, attempt_number=excluded.attempt_number`,
      args: [
        a.id, a.examId, a.studentId || null, a.telegramUserId, a.studentName || null, a.studentClass || null,
        a.startedAt, a.expiresAt, a.submittedAt || null, a.status,
        a.currentQuestionIndex || 0, a.score || 0, a.maxScore || 0, a.percentage || 0,
        a.correctCount || 0, a.wrongCount || 0, a.skippedCount || 0, a.timeTakenSeconds || 0,
        a.rank ?? null, a.isOfficial === false ? 0 : 1, a.attemptNumber || 1,
      ],
    });
    await db.execute({ sql: 'DELETE FROM attempt_answers WHERE attempt_id = ?', args: [a.id] });
    const answers = a.answers || {};
    for (const [qid, opt] of Object.entries(answers)) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO attempt_answers (attempt_id, question_id, option_index) VALUES (?,?,?)`,
        args: [a.id, qid, Number(opt)],
      });
    }
    n++;
  }
  return n;
}

async function migrateAudit(logs: any[]): Promise<number> {
  let n = 0;
  for (const l of logs || []) {
    await db.execute({
      sql: `INSERT INTO audit_logs (id, timestamp, action, details, actor, teacher_id)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(id) DO NOTHING`,
      args: [l.id, l.timestamp || new Date().toISOString(), l.action || '', l.details || '', l.actor || '', null],
    });
    n++;
  }
  return n;
}

async function migrateSettings(settings: any): Promise<void> {
  if (!settings || typeof settings !== 'object') return;
  await db.execute({
    sql: `INSERT INTO system_settings (id, bot_username, system_notice, bot_active, auto_publish_results, webhook_url, telegram_bot_token)
          VALUES (1,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET bot_username=excluded.bot_username, system_notice=excluded.system_notice,
            bot_active=excluded.bot_active, auto_publish_results=excluded.auto_publish_results,
            webhook_url=excluded.webhook_url`,
    args: [
      settings.botUsername || '@quizbotbypusparghya_bot',
      settings.systemNotice || '',
      settings.botActive === false ? 0 : 1,
      settings.autoPublishResults === false ? 0 : 1,
      settings.webhookUrl || '',
      '', // never copy raw token from blob into table if env owns it
    ],
  });
}

async function migrateQuestionBank(items: any[]): Promise<number> {
  let n = 0;
  for (const q of items || []) {
    await db.execute({
      sql: `INSERT INTO question_bank (id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json`,
      args: [
        q.id, q.teacherId || 'default', q.question || '', JSON.stringify(q.options || []),
        q.answer ?? null, q.marks ?? 1, q.negativeMarks ?? 0, q.explanation || null, q.subject || null,
      ],
    });
    n++;
  }
  return n;
}

export type MigrationReport = {
  backedUpBlobs: number;
  exams: number;
  questions: number;
  students: number;
  attempts: number;
  answers: number;
  auditLogs: number;
  questionBank: number;
  verified: boolean;
  errors: string[];
};

export async function runBlobMigration(): Promise<MigrationReport> {
  const report: MigrationReport = {
    backedUpBlobs: 0, exams: 0, questions: 0, students: 0, attempts: 0, answers: 0,
    auditLogs: 0, questionBank: 0, verified: false, errors: [],
  };

  await ensureSchema();
  report.backedUpBlobs = await backupBlobs();

  const blobs = await db.execute('SELECT teacher_id, key, data, updated_at FROM app_data');
  const byKey = new Map<string, any>();
  for (const row of blobs.rows as any[]) {
    byKey.set(`${row.teacher_id}|${row.key}`, parseJson(String(row.data), null));
  }

  // Prefer default key blobs; also merge other teacher_id rows
  for (const [mapKey, val] of byKey) {
    const [tid, key] = mapKey.split('|');
    try {
      if (key === 'exams' && Array.isArray(val)) report.exams += await migrateExams(tid, val);
      if (key === 'students' && Array.isArray(val)) report.students += await migrateStudents(val);
      if (key === 'attempts' && Array.isArray(val)) report.attempts += await migrateAttempts(val);
      if (key === 'auditLogs' && Array.isArray(val)) report.auditLogs += await migrateAudit(val);
      if (key === 'settings' && val) await migrateSettings(val);
      if (key === 'questionBank' && Array.isArray(val)) report.questionBank += await migrateQuestionBank(val);
    } catch (e: any) {
      report.errors.push(`${mapKey}: ${e?.message || e}`);
    }
  }

  const qCount = await db.execute('SELECT COUNT(*) as c FROM questions');
  const aCount = await db.execute('SELECT COUNT(*) as c FROM attempt_answers');
  report.questions = Number((qCount.rows[0] as any).c || 0);
  report.answers = Number((aCount.rows[0] as any).c || 0);

  // Verification vs blobs
  const blobExams = byKey.get('default|exams') || [];
  const blobAttempts = byKey.get('default|attempts') || [];
  const blobStudents = byKey.get('default|students') || [];
  const examTable = await db.execute('SELECT COUNT(*) as c FROM exams');
  const attTable = await db.execute('SELECT COUNT(*) as c FROM attempts');
  const stuTable = await db.execute('SELECT COUNT(*) as c FROM students');

  const eN = Number((examTable.rows[0] as any).c);
  const aN = Number((attTable.rows[0] as any).c);
  const sN = Number((stuTable.rows[0] as any).c);

  if (Array.isArray(blobExams) && blobExams.length && eN < blobExams.length) {
    report.errors.push(`exam count mismatch: blob ${blobExams.length} vs table ${eN}`);
  }
  if (Array.isArray(blobAttempts) && blobAttempts.length && aN < blobAttempts.length) {
    report.errors.push(`attempt count mismatch: blob ${blobAttempts.length} vs table ${aN}`);
  }
  if (Array.isArray(blobStudents) && blobStudents.length && sN < blobStudents.length) {
    report.errors.push(`student count mismatch: blob ${blobStudents.length} vs table ${sN}`);
  }

  report.verified = report.errors.length === 0;
  await db.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('DATABASE_SCHEMA_VERSION', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [report.verified ? '2-normalized' : '2-normalized-partial'],
  });
  await db.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('last_migration', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [new Date().toISOString()],
  });

    await db.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('blob_migrated_v1', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [new Date().toISOString()],
  });
  return report;
}
