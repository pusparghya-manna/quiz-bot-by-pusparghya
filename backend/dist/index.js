import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/index.ts
import express from "express";
import cors from "cors";
import dotenv3 from "dotenv";

// src/config/env.ts
import dotenv from "dotenv";
dotenv.config();
function required(name, fallback) {
  const v = process.env[name] || fallback;
  if (!v) {
    console.warn(`[config] Missing ${name}`);
  }
  return v || "";
}
var isProd = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || "";
  if (secret.length >= 24) return secret;
  if (isProd) {
    console.error("[security] FATAL: JWT_SECRET must be set to a long random string (\u226524 chars) in production");
    process.exit(1);
  }
  return secret || "dev-only-jwt-secret-change-me";
}
function assertSecureConfig() {
  if (!isProd) return;
  getJwtSecret();
  const missing = [];
  if (!process.env.TURSO_DATABASE_URL?.trim()) missing.push("TURSO_DATABASE_URL");
  if (!process.env.TURSO_AUTH_TOKEN?.trim()) missing.push("TURSO_AUTH_TOKEN");
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) missing.push("TELEGRAM_BOT_TOKEN");
  if (missing.length) {
    console.error(`[config] FATAL: Missing required production env: ${missing.join(", ")}`);
    process.exit(1);
  }
  const port = Number(process.env.PORT);
  if (process.env.PORT && (!Number.isFinite(port) || port <= 0)) {
    console.error(`[config] FATAL: Invalid PORT="${process.env.PORT}"`);
    process.exit(1);
  }
}
var env = {
  isProd,
  port: Number(process.env.PORT) || 3e3,
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  tursoUrl: process.env.TURSO_DATABASE_URL || "",
  tursoToken: process.env.TURSO_AUTH_TOKEN || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "https://quiz-bot-by-pusparghya.vercel.app,http://localhost:5173,http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  teacherUsername: process.env.TEACHER_USERNAME || "",
  teacherPassword: process.env.TEACHER_PASSWORD || "",
  teacherName: process.env.TEACHER_NAME || "",
  maxOcrBase64Chars: Number(process.env.MAX_OCR_BASE64_CHARS) || 1e7,
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH) || 3500,
  enableDangerousReseed: process.env.ENABLE_RESEED === "true",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  /** Explicit opt-out of long-polling (e.g. when using webhooks only) */
  telegramPollingEnabled: process.env.TELEGRAM_POLLING_ENABLED !== "false"
};
function corsOriginDelegate(origin, cb) {
  if (!origin) return cb(null, true);
  if (env.allowedOrigins.includes(origin) || env.allowedOrigins.includes("*")) {
    return cb(null, origin);
  }
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
    return cb(null, origin);
  }
  console.warn("[cors] Blocked origin:", origin);
  return cb(null, false);
}

// src/middleware/rateLimit.ts
var buckets = /* @__PURE__ */ new Map();
function rateLimit(opts) {
  const keyFn = opts.keyFn || ((req) => `${req.ip}:${req.path}`);
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > opts.max) {
      const retry = Math.ceil((b.resetAt - now) / 1e3);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}, 6e4).unref?.();

// src/middleware/validate.ts
function escapeMd(text) {
  return String(text || "").replace(/([_*`\[\]()])/g, "\\$1");
}
function clampStr(s, max) {
  return String(s ?? "").trim().slice(0, max);
}
function isSafeUsername(u) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(u);
}
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

// src/database/schema.ts
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_data (
  teacher_id TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (teacher_id, key)
);

CREATE TABLE IF NOT EXISTS app_data_backup (
  teacher_id TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  backed_up_at TEXT NOT NULL,
  PRIMARY KEY (teacher_id, key, backed_up_at)
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT,
  class_name TEXT,
  test_number TEXT,
  total_questions INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  total_marks REAL NOT NULL DEFAULT 0,
  negative_marking REAL NOT NULL DEFAULT 0,
  randomize_questions INTEGER NOT NULL DEFAULT 0,
  randomize_options INTEGER NOT NULL DEFAULT 0,
  result_visibility TEXT NOT NULL DEFAULT 'PUBLISHED',
  leaderboard_visibility TEXT NOT NULL DEFAULT 'PUBLISHED',
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_start ON exams(start_date);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  teacher_id TEXT,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer INTEGER,
  marks REAL NOT NULL DEFAULT 1,
  negative_marks REAL NOT NULL DEFAULT 0,
  explanation TEXT,
  subject TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);

CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer INTEGER,
  marks REAL NOT NULL DEFAULT 1,
  negative_marks REAL NOT NULL DEFAULT 0,
  explanation TEXT,
  subject TEXT
);
CREATE INDEX IF NOT EXISTS idx_qbank_teacher ON question_bank(teacher_id);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT,
  telegram_user_id INTEGER UNIQUE,
  telegram_username TEXT,
  link_code TEXT,
  status TEXT NOT NULL DEFAULT 'unlinked',
  linked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_students_tg ON students(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_students_code ON students(student_code);

CREATE TABLE IF NOT EXISTS student_teachers (
  student_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  PRIMARY KEY (student_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS idx_st_teacher ON student_teachers(teacher_id);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  student_id TEXT,
  telegram_user_id INTEGER NOT NULL,
  student_name TEXT,
  student_class TEXT,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  time_taken_seconds INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  is_official INTEGER NOT NULL DEFAULT 1,
  attempt_number INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_tg ON attempts(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam_tg ON attempts(exam_id, telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(exam_id, status, is_official);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  actor TEXT,
  teacher_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(timestamp);

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bot_username TEXT,
  system_notice TEXT,
  bot_active INTEGER NOT NULL DEFAULT 1,
  auto_publish_results INTEGER NOT NULL DEFAULT 1,
  webhook_url TEXT,
  telegram_bot_token TEXT
);

CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  job_id TEXT NOT NULL,
  telegram_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  PRIMARY KEY (job_id, telegram_user_id)
);
`;

// src/database/migrateFromBlobs.ts
function parseJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
async function ensureSchema() {
  for (const stmt of SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
}
async function backupBlobs() {
  const res = await db.execute("SELECT teacher_id, key, data, updated_at FROM app_data");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let n = 0;
  for (const row of res.rows) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_data_backup (teacher_id, key, data, updated_at, backed_up_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [row.teacher_id, row.key, row.data, row.updated_at, now]
    });
    n++;
  }
  return n;
}
async function migrateExams(teacherKey, exams) {
  let n = 0;
  for (const e of exams || []) {
    const teacherId = e.teacherId || teacherKey || "default";
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
        e.id,
        teacherId,
        e.title || "Exam",
        e.subject || null,
        e.className || null,
        e.testNumber || null,
        e.totalQuestions ?? (e.questions?.length || 0),
        e.startDate,
        e.durationMinutes || 60,
        e.totalMarks || 0,
        e.negativeMarking || 0,
        e.randomizeQuestions ? 1 : 0,
        e.randomizeOptions ? 1 : 0,
        e.resultVisibility || "PUBLISHED",
        e.leaderboardVisibility || "PUBLISHED",
        e.status || "SCHEDULED",
        e.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        e.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
      ]
    });
    await db.execute({ sql: "DELETE FROM questions WHERE exam_id = ?", args: [e.id] });
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
          q.id,
          e.id,
          teacherId,
          q.question || "",
          JSON.stringify(q.options || []),
          q.answer ?? null,
          q.marks ?? 1,
          q.negativeMarks ?? 0,
          q.explanation || null,
          q.subject || null,
          i
        ]
      });
    }
    n++;
  }
  return n;
}
async function migrateStudents(students) {
  let n = 0;
  for (const s of students || []) {
    await db.execute({
      sql: `INSERT INTO students (id, student_code, name, class_name, telegram_user_id, telegram_username, link_code, status, linked_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, telegram_user_id=excluded.telegram_user_id,
              telegram_username=excluded.telegram_username, status=excluded.status, linked_at=excluded.linked_at,
              student_code=excluded.student_code, class_name=excluded.class_name, link_code=excluded.link_code`,
      args: [
        s.id,
        s.studentId || s.id,
        s.name || "Student",
        s.className || null,
        s.telegramUserId ?? null,
        s.telegramUsername || null,
        s.linkCode || null,
        s.status || "linked",
        s.linkedAt || null
      ]
    });
    const tids = Array.isArray(s.teacherIds) ? s.teacherIds : [];
    for (const tid of tids) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)`,
        args: [s.id, tid]
      });
    }
    n++;
  }
  return n;
}
async function migrateAttempts(attempts) {
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
        a.id,
        a.examId,
        a.studentId || null,
        a.telegramUserId,
        a.studentName || null,
        a.studentClass || null,
        a.startedAt,
        a.expiresAt,
        a.submittedAt || null,
        a.status,
        a.currentQuestionIndex || 0,
        a.score || 0,
        a.maxScore || 0,
        a.percentage || 0,
        a.correctCount || 0,
        a.wrongCount || 0,
        a.skippedCount || 0,
        a.timeTakenSeconds || 0,
        a.rank ?? null,
        a.isOfficial === false ? 0 : 1,
        a.attemptNumber || 1
      ]
    });
    await db.execute({ sql: "DELETE FROM attempt_answers WHERE attempt_id = ?", args: [a.id] });
    const answers = a.answers || {};
    for (const [qid, opt] of Object.entries(answers)) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO attempt_answers (attempt_id, question_id, option_index) VALUES (?,?,?)`,
        args: [a.id, qid, Number(opt)]
      });
    }
    n++;
  }
  return n;
}
async function migrateAudit(logs) {
  let n = 0;
  for (const l of logs || []) {
    await db.execute({
      sql: `INSERT INTO audit_logs (id, timestamp, action, details, actor, teacher_id)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(id) DO NOTHING`,
      args: [l.id, l.timestamp || (/* @__PURE__ */ new Date()).toISOString(), l.action || "", l.details || "", l.actor || "", null]
    });
    n++;
  }
  return n;
}
async function migrateSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  await db.execute({
    sql: `INSERT INTO system_settings (id, bot_username, system_notice, bot_active, auto_publish_results, webhook_url, telegram_bot_token)
          VALUES (1,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET bot_username=excluded.bot_username, system_notice=excluded.system_notice,
            bot_active=excluded.bot_active, auto_publish_results=excluded.auto_publish_results,
            webhook_url=excluded.webhook_url`,
    args: [
      settings.botUsername || "@quizbotbypusparghya_bot",
      settings.systemNotice || "",
      settings.botActive === false ? 0 : 1,
      settings.autoPublishResults === false ? 0 : 1,
      settings.webhookUrl || "",
      ""
      // never copy raw token from blob into table if env owns it
    ]
  });
}
async function migrateQuestionBank(items) {
  let n = 0;
  for (const q of items || []) {
    await db.execute({
      sql: `INSERT INTO question_bank (id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json`,
      args: [
        q.id,
        q.teacherId || "default",
        q.question || "",
        JSON.stringify(q.options || []),
        q.answer ?? null,
        q.marks ?? 1,
        q.negativeMarks ?? 0,
        q.explanation || null,
        q.subject || null
      ]
    });
    n++;
  }
  return n;
}
async function runBlobMigration() {
  const report = {
    backedUpBlobs: 0,
    exams: 0,
    questions: 0,
    students: 0,
    attempts: 0,
    answers: 0,
    auditLogs: 0,
    questionBank: 0,
    verified: false,
    errors: []
  };
  await ensureSchema();
  report.backedUpBlobs = await backupBlobs();
  const blobs = await db.execute("SELECT teacher_id, key, data, updated_at FROM app_data");
  const byKey = /* @__PURE__ */ new Map();
  for (const row of blobs.rows) {
    byKey.set(`${row.teacher_id}|${row.key}`, parseJson(String(row.data), null));
  }
  for (const [mapKey, val] of byKey) {
    const [tid, key] = mapKey.split("|");
    try {
      if (key === "exams" && Array.isArray(val)) report.exams += await migrateExams(tid, val);
      if (key === "students" && Array.isArray(val)) report.students += await migrateStudents(val);
      if (key === "attempts" && Array.isArray(val)) report.attempts += await migrateAttempts(val);
      if (key === "auditLogs" && Array.isArray(val)) report.auditLogs += await migrateAudit(val);
      if (key === "settings" && val) await migrateSettings(val);
      if (key === "questionBank" && Array.isArray(val)) report.questionBank += await migrateQuestionBank(val);
    } catch (e) {
      report.errors.push(`${mapKey}: ${e?.message || e}`);
    }
  }
  const qCount = await db.execute("SELECT COUNT(*) as c FROM questions");
  const aCount = await db.execute("SELECT COUNT(*) as c FROM attempt_answers");
  report.questions = Number(qCount.rows[0].c || 0);
  report.answers = Number(aCount.rows[0].c || 0);
  const blobExams = byKey.get("default|exams") || [];
  const blobAttempts = byKey.get("default|attempts") || [];
  const blobStudents = byKey.get("default|students") || [];
  const examTable = await db.execute("SELECT COUNT(*) as c FROM exams");
  const attTable = await db.execute("SELECT COUNT(*) as c FROM attempts");
  const stuTable = await db.execute("SELECT COUNT(*) as c FROM students");
  const eN = Number(examTable.rows[0].c);
  const aN = Number(attTable.rows[0].c);
  const sN = Number(stuTable.rows[0].c);
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
    args: [report.verified ? "2-normalized" : "2-normalized-partial"]
  });
  await db.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('last_migration', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [(/* @__PURE__ */ new Date()).toISOString()]
  });
  return report;
}

// src/db.ts
import { createClient } from "@libsql/client";
import dotenv2 from "dotenv";
dotenv2.config();
var url = process.env.TURSO_DATABASE_URL;
var authToken = process.env.TURSO_AUTH_TOKEN;
var isProd2 = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
var dbUrl = url || "file:local.db";
if (dbUrl.startsWith("libsql://")) {
  dbUrl = "https://" + dbUrl.slice("libsql://".length);
}
if (isProd2 && !url) {
  console.error("[db] FATAL: TURSO_DATABASE_URL is required in production");
  process.exit(1);
}
var db = createClient({
  url: dbUrl,
  authToken: authToken || void 0
});
async function initDb() {
  const maxAttempts = isProd2 ? 8 : 5;
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await db.execute("SELECT 1");
      await ensureSchema();
      console.log("[db] Turso connected; schema ready");
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[db] init attempt ${i}/${maxAttempts} failed:`, err?.message || err);
      if (i < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * i));
      }
    }
  }
  if (isProd2) {
    console.error("[db] FATAL: Could not connect to Turso after retries. Refusing to start.");
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
  console.warn("[db] Turso unavailable \u2014 continuing in development only (data may not persist)");
}

// src/examStatus.ts
function effectiveExamStatus(exam) {
  const start = new Date(exam.startDate).getTime();
  if (!Number.isFinite(start)) return "SCHEDULED";
  const end = start + Math.max(1, Number(exam.durationMinutes) || 60) * 6e4;
  const now = Date.now();
  if (now < start) return "SCHEDULED";
  if (now < end) return "LIVE";
  return "RESULTS_PUBLISHED";
}
function withEffectiveStatus(exam) {
  return { ...exam, status: effectiveExamStatus(exam) };
}

// src/store.ts
function generateInitialSettings() {
  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    webhookUrl: "",
    botUsername: "@quizbotbypusparghya_bot",
    botActive: true,
    autoPublishResults: true,
    systemNotice: "System ready for exam setup."
  };
}
var Store = class {
  data = {
    exams: [],
    questionBank: [],
    students: [],
    attempts: [],
    auditLogs: [],
    settings: generateInitialSettings()
  };
  ready = false;
  schemaVersion = "1-blob";
  async init() {
    try {
      await ensureSchema();
      const examCount = await db.execute("SELECT COUNT(*) as c FROM exams");
      const blobExams = await db.execute({
        sql: `SELECT data FROM app_data WHERE key = 'exams' LIMIT 1`,
        args: []
      }).catch(() => ({ rows: [] }));
      const nExams = Number(examCount.rows[0]?.c || 0);
      if (nExams === 0 && blobExams.rows.length > 0) {
        console.log("[migration] Normalized tables empty \u2014 running blob \u2192 SQL migration\u2026");
        const report = await runBlobMigration();
        console.log("[migration] report", JSON.stringify(report));
      }
      await this.loadFromSql();
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      }
      this.ready = true;
      console.log(
        `Store loaded from SQL: exams=${this.data.exams.length} students=${this.data.students.length} attempts=${this.data.attempts.length}`
      );
    } catch (e) {
      console.error("Store init error", e);
      const isProd3 = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
      if (isProd3) {
        this.ready = false;
        throw e;
      }
      this.ready = true;
    }
  }
  isReady() {
    return this.ready;
  }
  async loadFromSql() {
    const [sres, eres, sstud, ares, lres, qb] = await Promise.all([
      db.execute("SELECT * FROM system_settings WHERE id = 1"),
      db.execute("SELECT * FROM exams ORDER BY created_at DESC"),
      db.execute("SELECT * FROM students"),
      db.execute("SELECT * FROM attempts"),
      db.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200"),
      db.execute("SELECT * FROM question_bank")
    ]);
    if (sres.rows.length) {
      const r = sres.rows[0];
      this.data.settings = {
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || r.telegram_bot_token || "",
        webhookUrl: r.webhook_url || "",
        botUsername: r.bot_username || "@quizbotbypusparghya_bot",
        botActive: Boolean(r.bot_active),
        autoPublishResults: Boolean(r.auto_publish_results),
        systemNotice: r.system_notice || ""
      };
    }
    const exams = [];
    for (const r of eres.rows) {
      const qres = await db.execute({
        sql: "SELECT * FROM questions WHERE exam_id = ? ORDER BY sort_order ASC",
        args: [r.id]
      });
      const questions = qres.rows.map((q) => ({
        id: String(q.id),
        question: q.question,
        options: JSON.parse(String(q.options_json || "[]")),
        answer: q.answer === null || q.answer === void 0 ? null : Number(q.answer),
        marks: Number(q.marks ?? 1),
        negativeMarks: Number(q.negative_marks ?? 0),
        explanation: q.explanation || void 0,
        subject: q.subject || void 0
      }));
      exams.push({
        id: String(r.id),
        teacherId: r.teacher_id || void 0,
        title: r.title,
        subject: r.subject || "",
        className: r.class_name || "",
        testNumber: r.test_number || "",
        totalQuestions: Number(r.total_questions || questions.length),
        startDate: r.start_date,
        durationMinutes: Number(r.duration_minutes || 60),
        totalMarks: Number(r.total_marks || 0),
        negativeMarking: Number(r.negative_marking || 0),
        randomizeQuestions: Boolean(r.randomize_questions),
        randomizeOptions: Boolean(r.randomize_options),
        resultVisibility: r.result_visibility || "PUBLISHED",
        leaderboardVisibility: r.leaderboard_visibility || "PUBLISHED",
        status: effectiveExamStatus({ startDate: r.start_date, durationMinutes: Number(r.duration_minutes || 60) }),
        questions,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      });
    }
    this.data.exams = exams;
    const students = [];
    for (const r of sstud.rows) {
      const tres = await db.execute({
        sql: "SELECT teacher_id FROM student_teachers WHERE student_id = ?",
        args: [r.id]
      });
      students.push({
        id: String(r.id),
        studentId: r.student_code,
        name: r.name,
        className: r.class_name || "ALL",
        telegramUserId: r.telegram_user_id != null ? Number(r.telegram_user_id) : void 0,
        telegramUsername: r.telegram_username || void 0,
        linkCode: r.link_code || void 0,
        status: r.status || "linked",
        linkedAt: r.linked_at || void 0,
        teacherIds: tres.rows.map((x) => String(x.teacher_id))
      });
    }
    this.data.students = students;
    const attempts = [];
    for (const r of ares.rows) {
      const status = String(r.status);
      let answers = {};
      if (status === "IN_PROGRESS") {
        const ans = await db.execute({
          sql: "SELECT question_id, option_index FROM attempt_answers WHERE attempt_id = ?",
          args: [r.id]
        });
        for (const a of ans.rows) {
          answers[String(a.question_id)] = Number(a.option_index);
        }
      }
      attempts.push({
        id: String(r.id),
        examId: String(r.exam_id),
        studentId: r.student_id || "",
        telegramUserId: Number(r.telegram_user_id),
        studentName: r.student_name || "",
        studentClass: r.student_class || "",
        startedAt: r.started_at,
        expiresAt: r.expires_at,
        submittedAt: r.submitted_at || void 0,
        status,
        answers,
        currentQuestionIndex: Number(r.current_question_index || 0),
        score: Number(r.score || 0),
        maxScore: Number(r.max_score || 0),
        percentage: Number(r.percentage || 0),
        correctCount: Number(r.correct_count || 0),
        wrongCount: Number(r.wrong_count || 0),
        skippedCount: Number(r.skipped_count || 0),
        timeTakenSeconds: Number(r.time_taken_seconds || 0),
        rank: r.rank == null ? void 0 : Number(r.rank),
        isOfficial: r.is_official === void 0 ? true : Boolean(r.is_official),
        attemptNumber: Number(r.attempt_number || 1)
      });
    }
    this.data.attempts = attempts;
    this.data.auditLogs = lres.rows.map((r) => ({
      id: String(r.id),
      timestamp: r.timestamp,
      action: r.action,
      details: r.details || "",
      actor: r.actor || "system"
    }));
    this.data.questionBank = qb.rows.map((q) => ({
      id: String(q.id),
      teacherId: q.teacher_id || void 0,
      question: q.question,
      options: JSON.parse(String(q.options_json || "[]")),
      answer: q.answer === null || q.answer === void 0 ? null : Number(q.answer),
      marks: Number(q.marks ?? 1),
      negativeMarks: Number(q.negative_marks ?? 0),
      explanation: q.explanation || void 0,
      subject: q.subject || void 0
    }));
  }
  /** Load answers for an attempt from SQL (for detail / scoring). */
  async loadAttemptAnswers(attemptId) {
    const ans = await db.execute({
      sql: "SELECT question_id, option_index FROM attempt_answers WHERE attempt_id = ?",
      args: [attemptId]
    });
    const answers = {};
    for (const a of ans.rows) {
      answers[String(a.question_id)] = Number(a.option_index);
    }
    const att = this.data.attempts.find((x) => x.id === attemptId);
    if (att) att.answers = answers;
    return answers;
  }
  async persistExam(exam) {
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
        exam.id,
        exam.teacherId || "default",
        exam.title,
        exam.subject || null,
        exam.className || null,
        exam.testNumber || null,
        exam.questions?.length ?? exam.totalQuestions ?? 0,
        exam.startDate,
        exam.durationMinutes || 60,
        exam.totalMarks || 0,
        exam.negativeMarking || 0,
        exam.randomizeQuestions ? 1 : 0,
        exam.randomizeOptions ? 1 : 0,
        exam.resultVisibility || "PUBLISHED",
        exam.leaderboardVisibility || "PUBLISHED",
        status,
        exam.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        (/* @__PURE__ */ new Date()).toISOString()
      ]
    });
    await db.execute({ sql: "DELETE FROM questions WHERE exam_id = ?", args: [exam.id] });
    for (let i = 0; i < (exam.questions || []).length; i++) {
      const q = exam.questions[i];
      await db.execute({
        sql: `INSERT INTO questions (id, exam_id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject, sort_order)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          q.id,
          exam.id,
          exam.teacherId || null,
          q.question,
          JSON.stringify(q.options || []),
          q.answer,
          q.marks ?? 1,
          q.negativeMarks ?? 0,
          q.explanation || null,
          q.subject || null,
          i
        ]
      });
    }
  }
  async persistStudent(student) {
    await db.execute({
      sql: `INSERT INTO students (id, student_code, name, class_name, telegram_user_id, telegram_username, link_code, status, linked_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, student_code=excluded.student_code,
              class_name=excluded.class_name, telegram_user_id=excluded.telegram_user_id,
              telegram_username=excluded.telegram_username, link_code=excluded.link_code,
              status=excluded.status, linked_at=excluded.linked_at`,
      args: [
        student.id,
        student.studentId,
        student.name,
        student.className || null,
        student.telegramUserId,
        student.telegramUsername,
        student.linkCode || null,
        student.status,
        student.linkedAt || null
      ]
    });
    for (const tid of student.teacherIds || []) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)",
        args: [student.id, tid]
      });
    }
  }
  async persistAttempt(attempt) {
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
        attempt.id,
        attempt.examId,
        attempt.studentId || null,
        attempt.telegramUserId,
        attempt.studentName || null,
        attempt.studentClass || null,
        attempt.startedAt,
        attempt.expiresAt,
        attempt.submittedAt,
        attempt.status,
        attempt.currentQuestionIndex || 0,
        attempt.score || 0,
        attempt.maxScore || 0,
        attempt.percentage || 0,
        attempt.correctCount || 0,
        attempt.wrongCount || 0,
        attempt.skippedCount || 0,
        attempt.timeTakenSeconds || 0,
        attempt.rank ?? null,
        attempt.isOfficial === false ? 0 : 1,
        attempt.attemptNumber || 1
      ]
    });
    const answers = attempt.answers || {};
    if (Object.keys(answers).length > 0 || attempt.status === "IN_PROGRESS") {
      await db.execute({ sql: "DELETE FROM attempt_answers WHERE attempt_id = ?", args: [attempt.id] });
      for (const [qid, opt] of Object.entries(answers)) {
        await db.execute({
          sql: "INSERT OR REPLACE INTO attempt_answers (attempt_id, question_id, option_index) VALUES (?,?,?)",
          args: [attempt.id, qid, Number(opt)]
        });
      }
    }
  }
  getExams() {
    return this.data.exams.map((e) => ({ ...e, status: effectiveExamStatus(e) }));
  }
  getExamById(id) {
    const e = this.data.exams.find((x) => x.id === id || x.id.toLowerCase() === id.toLowerCase());
    return e ? { ...e, status: effectiveExamStatus(e) } : void 0;
  }
  async saveExam(exam) {
    exam.status = effectiveExamStatus(exam);
    exam.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const idx = this.data.exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) this.data.exams[idx] = exam;
    else this.data.exams.unshift(exam);
    await this.persistExam(exam);
    return exam;
  }
  async deleteExam(id) {
    this.data.exams = this.data.exams.filter((e) => e.id !== id);
    this.data.attempts = this.data.attempts.filter((a) => a.examId !== id);
    await db.execute({ sql: "DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = ?)", args: [id] });
    await db.execute({ sql: "DELETE FROM attempts WHERE exam_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM questions WHERE exam_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM exams WHERE id = ?", args: [id] });
  }
  getStudents() {
    return this.data.students;
  }
  getStudentById(id) {
    return this.data.students.find((s) => s.id === id);
  }
  getStudentByTelegramId(tg) {
    return this.data.students.find((s) => s.telegramUserId === tg);
  }
  async saveStudent(student) {
    const idx = this.data.students.findIndex((s) => s.id === student.id);
    if (idx >= 0) this.data.students[idx] = student;
    else this.data.students.push(student);
    await this.persistStudent(student);
    return student;
  }
  async deleteStudent(id) {
    this.data.students = this.data.students.filter((s) => s.id !== id);
    await db.execute({ sql: "DELETE FROM student_teachers WHERE student_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM students WHERE id = ?", args: [id] });
  }
  getAttempts(examId) {
    return examId ? this.data.attempts.filter((a) => a.examId === examId) : this.data.attempts;
  }
  getStudentAttempts(examId, telegramUserId) {
    return this.data.attempts.filter((a) => a.examId === examId && a.telegramUserId === telegramUserId).sort((a, b) => (a.attemptNumber || 1) - (b.attemptNumber || 1));
  }
  getAttempt(examId, telegramUserId) {
    const mine = this.getStudentAttempts(examId, telegramUserId);
    return mine.find((a) => a.status === "IN_PROGRESS") || mine[mine.length - 1];
  }
  async deleteAttempt(id) {
    this.data.attempts = this.data.attempts.filter((a) => a.id !== id);
    await db.execute({ sql: "DELETE FROM attempt_answers WHERE attempt_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM attempts WHERE id = ?", args: [id] });
  }
  async saveAttempt(attempt) {
    const idx = this.data.attempts.findIndex((a) => a.id === attempt.id);
    if (idx >= 0) this.data.attempts[idx] = attempt;
    else this.data.attempts.push(attempt);
    await this.persistAttempt(attempt);
    return attempt;
  }
  hasOfficialAttempt(examId, telegramUserId) {
    return this.getStudentAttempts(examId, telegramUserId).some(
      (a) => a.isOfficial !== false && (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED" || a.status === "IN_PROGRESS")
    );
  }
  getQuestionBank() {
    return this.data.questionBank;
  }
  async saveQuestion(q) {
    const idx = this.data.questionBank.findIndex((x) => x.id === q.id);
    if (idx >= 0) this.data.questionBank[idx] = q;
    else this.data.questionBank.push(q);
    await db.execute({
      sql: `INSERT INTO question_bank (id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json`,
      args: [
        q.id,
        q.teacherId || "default",
        q.question,
        JSON.stringify(q.options || []),
        q.answer,
        q.marks ?? 1,
        q.negativeMarks ?? 0,
        q.explanation || null,
        q.subject || null
      ]
    });
    return q;
  }
  async deleteQuestion(id) {
    this.data.questionBank = this.data.questionBank.filter((q) => q.id !== id);
    await db.execute({ sql: "DELETE FROM question_bank WHERE id = ?", args: [id] });
  }
  getSettings() {
    return this.data.settings;
  }
  async updateSettings(partial) {
    this.data.settings = { ...this.data.settings, ...partial };
    if (process.env.TELEGRAM_BOT_TOKEN) this.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    await db.execute({
      sql: `INSERT INTO system_settings (id, bot_username, system_notice, bot_active, auto_publish_results, webhook_url, telegram_bot_token)
            VALUES (1,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET bot_username=excluded.bot_username, system_notice=excluded.system_notice,
              bot_active=excluded.bot_active, auto_publish_results=excluded.auto_publish_results, webhook_url=excluded.webhook_url`,
      args: [
        this.data.settings.botUsername,
        this.data.settings.systemNotice || "",
        this.data.settings.botActive ? 1 : 0,
        this.data.settings.autoPublishResults ? 1 : 0,
        this.data.settings.webhookUrl || "",
        ""
      ]
    });
    return this.data.settings;
  }
  getAuditLogs() {
    return this.data.auditLogs;
  }
  async addAuditLog(action, details, actor = "system") {
    const log = {
      id: `LOG_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      action,
      details,
      actor
    };
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) this.data.auditLogs.length = 500;
    await db.execute({
      sql: "INSERT INTO audit_logs (id, timestamp, action, details, actor, teacher_id) VALUES (?,?,?,?,?,?)",
      args: [log.id, log.timestamp, log.action, log.details, log.actor, null]
    });
  }
  async resetToSeed() {
    return this.data;
  }
};
var store = new Store();

// src/middleware/ownership.ts
function teacherIdOf(req) {
  return req.teacher?.username;
}
function requireTeacher(req, res) {
  const id = teacherIdOf(req);
  if (!id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return id;
}
function getOwnedExam(examId, teacherId) {
  const exam = store.getExamById(examId);
  if (!exam || exam.teacherId !== teacherId) return null;
  return exam;
}
function studentBelongsToTeacher(student, teacherId) {
  if (Array.isArray(student.teacherIds) && student.teacherIds.includes(teacherId)) return true;
  const myExamIds = new Set(
    store.getExams().filter((e) => e.teacherId === teacherId).map((e) => e.id)
  );
  return store.getAttempts().some(
    (a) => myExamIds.has(a.examId) && (a.studentId === student.studentId || !!student.telegramUserId && a.telegramUserId === student.telegramUserId)
  );
}
function attemptBelongsToTeacher(attempt, teacherId) {
  const exam = store.getExamById(attempt.examId);
  return !!exam && exam.teacherId === teacherId;
}
function questionBelongsToTeacher(q, teacherId) {
  if (q.teacherId) return q.teacherId === teacherId;
  if (q.examId) {
    const exam = store.getExamById(q.examId);
    return !!exam && exam.teacherId === teacherId;
  }
  return false;
}

// src/auth.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
async function ensureTeachersTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS teachers (
        username TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    const user = env.teacherUsername.trim();
    const pass = env.teacherPassword;
    if (user && pass) {
      if (!isSafeUsername(user)) {
        console.warn("[auth] TEACHER_USERNAME invalid format, skip seed");
        return;
      }
      const existing = await db.execute({
        sql: "SELECT username FROM teachers WHERE username = ?",
        args: [user]
      });
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(pass, 12);
        const name = clampStr(env.teacherName || user, 80);
        await db.execute({
          sql: "INSERT INTO teachers (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
          args: [user, name, hash, (/* @__PURE__ */ new Date()).toISOString()]
        });
        console.log("Seeded teacher from environment:", user);
      }
    }
  } catch (e) {
    console.error("ensureTeachersTable failed", e);
  }
}
async function registerTeacher(username, password, name) {
  const u = clampStr(username, 32);
  if (!isSafeUsername(u)) throw new Error("Username: 3\u201332 letters, numbers, underscore only");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (password.length > 128) throw new Error("Password too long");
  const exists = await db.execute({
    sql: "SELECT username FROM teachers WHERE username = ?",
    args: [u]
  });
  if (exists.rows.length > 0) throw new Error("Username already taken");
  const hash = await bcrypt.hash(password, 12);
  const display = clampStr(name || u, 80) || u;
  await db.execute({
    sql: "INSERT INTO teachers (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
    args: [u, display, hash, (/* @__PURE__ */ new Date()).toISOString()]
  });
  const secret = getJwtSecret();
  const token = jwt.sign({ username: u, name: display }, secret, { expiresIn: "7d" });
  return { token, teacher: { username: u, name: display } };
}
async function loginTeacher(username, password) {
  const u = clampStr(username, 32);
  const res = await db.execute({
    sql: "SELECT username, name, password_hash FROM teachers WHERE username = ?",
    args: [u]
  });
  if (res.rows.length === 0) {
    await bcrypt.compare(password, "$2a$12$invalidhashinvalidhashinvalidho");
    throw new Error("Invalid username or password");
  }
  const row = res.rows[0];
  const ok = await bcrypt.compare(password, String(row.password_hash));
  if (!ok) throw new Error("Invalid username or password");
  const payload = { username: String(row.username), name: String(row.name) };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
  return { token, teacher: { username: payload.username, name: payload.name } };
}
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(header.slice(7), getJwtSecret());
    if (!payload?.username) return res.status(401).json({ error: "Invalid token" });
    req.teacher = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// src/utils/telegramSplit.ts
function splitTelegramMessage(text, maxLength = 4e3) {
  if (text == null) return [""];
  const s = String(text);
  if (s.length <= maxLength) return [s];
  const chunks = [];
  let remaining = s;
  while (remaining.length > maxLength) {
    let slice = remaining.slice(0, maxLength);
    let breakAt = -1;
    const nl = slice.lastIndexOf("\n");
    if (nl >= Math.floor(maxLength * 0.4)) breakAt = nl + 1;
    if (breakAt < 0) {
      const sp = slice.lastIndexOf(" ");
      if (sp >= Math.floor(maxLength * 0.4)) breakAt = sp + 1;
    }
    if (breakAt < 0) {
      breakAt = maxLength;
      if (breakAt > 0 && breakAt < remaining.length) {
        const code = remaining.charCodeAt(breakAt - 1);
        if (code >= 55296 && code <= 56319) breakAt -= 1;
      }
    }
    const part = remaining.slice(0, breakAt).trimEnd();
    chunks.push(part.length ? part : remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks.length ? chunks : [""];
}

// src/telegram/safeSend.ts
var TELEGRAM_TIMEOUT_MS = 12e3;
var MAX_RETRIES = 3;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function fetchTelegram(token, method, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    return await res.json().catch(() => ({ ok: false, description: "Invalid JSON from Telegram" }));
  } finally {
    clearTimeout(timer);
  }
}
async function callWithRetry(token, method, body) {
  let last = { ok: false, description: "unknown" };
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      last = await fetchTelegram(token, method, body);
      if (last?.ok) return last;
      const desc = String(last?.description || "");
      if (desc.toLowerCase().includes("message is not modified")) return { ok: true, result: last?.result };
      if (last?.error_code === 429 || desc.includes("Too Many Requests")) {
        const retryAfter = Number(last?.parameters?.retry_after || 2);
        await sleep(Math.min(30, Math.max(1, retryAfter)) * 1e3);
        continue;
      }
      if (last?.error_code === 403 || last?.error_code === 400 || desc.includes("blocked") || desc.includes("chat not found") || desc.includes("user is deactivated")) {
        return { ...last, permanent: true };
      }
      if (desc.includes("can't parse entities") || desc.includes("parse entities")) {
        return last;
      }
      await sleep(200 * Math.pow(2, attempt));
    } catch (e) {
      last = { ok: false, description: e?.name === "AbortError" ? "timeout" : e?.message || "network" };
      await sleep(200 * Math.pow(2, attempt));
    }
  }
  return last;
}
async function sendSafeTelegramMessage(token, chatId, text, options = {}) {
  if (!token) return { ok: false, error: "missing token", permanent: true };
  const chunks = splitTelegramMessage(text, 4e3);
  const messageIds = [];
  let parseMode = options.parseMode;
  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    const useEdit = Boolean(options.preferEdit && options.messageId && isFirst && chunks.length === 1);
    const body = {
      chat_id: chatId,
      text: chunks[i]
    };
    if (parseMode) body.parse_mode = parseMode;
    if (isFirst && options.replyMarkup) body.reply_markup = options.replyMarkup;
    let method = "sendMessage";
    if (useEdit) {
      method = "editMessageText";
      body.message_id = options.messageId;
    }
    let data = await callWithRetry(token, method, body);
    if (!data?.ok && parseMode && String(data?.description || "").includes("parse")) {
      delete body.parse_mode;
      parseMode = void 0;
      data = await callWithRetry(token, method, body);
    }
    if (!data?.ok && (useEdit || method === "editMessageText")) {
      const desc = String(data?.description || "").toLowerCase();
      delete body.message_id;
      if (desc.includes("too long") && String(body.text || "").length > 3500) {
        body.text = String(body.text).slice(0, 3490) + "\n\u2026";
      }
      data = await callWithRetry(token, "sendMessage", body);
    }
    if (!data?.ok) {
      return {
        ok: false,
        messageIds,
        error: String(data?.description || "telegram error"),
        permanent: Boolean(data?.permanent)
      };
    }
    if (data?.result?.message_id) messageIds.push(data.result.message_id);
    if (i < chunks.length - 1) await sleep(50);
  }
  return { ok: true, messageIds };
}

// src/telegram/bot.ts
function calculateAttemptScore(exam, answers, timeTakenSecs) {
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  let score = 0;
  exam.questions.forEach((q) => {
    const selected = answers[q.id];
    if (selected === void 0 || selected === null) {
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
  const percentage = maxScore > 0 ? Math.round(score / maxScore * 100 * 10) / 10 : 0;
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
function updateExamRanks(examId) {
  const attempts = store.getAttempts(examId).filter(
    (a) => (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED") && a.isOfficial !== false
  );
  attempts.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return aTime - bTime;
  });
  store.getAttempts(examId).forEach((att) => {
    if (att.isOfficial === false) {
      att.rank = void 0;
      store.saveAttempt(att);
    }
  });
  attempts.forEach((att, idx) => {
    att.rank = idx + 1;
    store.saveAttempt(att);
  });
}
function getExamWindow(exam) {
  const start = new Date(exam.startDate).getTime();
  const end = start + Math.max(1, exam.durationMinutes || 60) * 60 * 1e3;
  return { start, end };
}
function isExamWindowOpen(exam, now = Date.now()) {
  const { start, end } = getExamWindow(exam);
  return now >= start && now < end;
}
function isExamTimeEnded(exam) {
  return Date.now() >= getExamWindow(exam).end;
}
var pendingNameUsers = /* @__PURE__ */ new Set();
function formatInIST(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "\u2014";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = (get("dayPeriod") || "").toUpperCase();
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}
function formatRemaining(expiresAtIso) {
  const expiresAt = new Date(expiresAtIso).getTime();
  const now = Date.now();
  const diff = Math.max(0, expiresAt - now);
  const mins = Math.floor(diff / 6e4);
  const secs = Math.floor(diff % 6e4 / 1e3);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
function linkStudentToTeacher(student, teacherId) {
  if (!teacherId) return student;
  const ids = Array.isArray(student.teacherIds) ? [...student.teacherIds] : [];
  if (!ids.includes(teacherId)) {
    ids.push(teacherId);
    student.teacherIds = ids;
    store.saveStudent(student);
  }
  return student;
}
function getOrCreateStudent(user) {
  let student = store.getStudentByTelegramId(user.id);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const telegramUsername = user.username ? `@${user.username}` : void 0;
  let name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (!name && telegramUsername) {
    name = telegramUsername;
  }
  if (!name) {
    name = "Student";
  }
  if (!student) {
    student = {
      id: `STU_${user.id}`,
      studentId: `S${String(user.id).slice(-6)}`,
      name,
      className: "ALL",
      status: "linked",
      linkCode: `S${String(user.id).slice(-6)}`,
      telegramUserId: user.id,
      telegramUsername,
      linkedAt: now
    };
    store.saveStudent(student);
    store.addAuditLog("STUDENT_AUTO_REGISTERED", `Auto-registered Telegram student ${name} (${telegramUsername || user.id})`);
  } else {
    let updated = false;
    if (telegramUsername && student.telegramUsername !== telegramUsername) {
      student.telegramUsername = telegramUsername;
      updated = true;
    }
    if (name && (student.name.startsWith("Student #") || !student.name)) {
      student.name = name;
      updated = true;
    }
    if (updated) {
      store.saveStudent(student);
    }
  }
  return student;
}
function renderMainMenu(student) {
  const notice = store.getSettings().systemNotice;
  return {
    chatId: student.telegramUserId,
    text: `\u{1F44B} *Welcome to Quiz Bot by Pusparghya!*

` + (notice ? `\u{1F4E2} ${notice}

` : "") + `You are registered as *${student.name}*.

Teachers share a special link for each exam. Open that link to start.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }],
        [{ text: "\u{1F4CA} My Results", callback_data: "btn_results" }],
        [{ text: "\u{1F3C6} Leaderboards", callback_data: "btn_leaderboard" }],
        [{ text: "\u270F\uFE0F Set your name", callback_data: "btn_setname" }]
      ]
    },
    type: "editMessageText"
  };
}
async function processTelegramUpdate(update) {
  const now = /* @__PURE__ */ new Date();
  if (update.callback_query) {
    const cb = update.callback_query;
    const user = cb.from;
    const data = cb.data || "";
    const student = getOrCreateStudent(user);
    const cbMessageId = cb.message?.message_id;
    let response = null;
    if (data === "btn_home" || data === "btn_menu") {
      pendingNameUsers.delete(user.id);
      response = renderMainMenu(student);
    } else if (data === "btn_setname") {
      pendingNameUsers.add(user.id);
      response = {
        chatId: user.id,
        text: `\u270F\uFE0F *Set your name*

Please *type your full name* and send it as a message.

This name will appear on results and the leaderboard.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]
          ]
        },
        type: "editMessageText"
      };
    } else if (data === "btn_exams") {
      response = renderExamsList(student);
    } else if (data === "btn_results") {
      response = renderStudentResults(student);
    } else if (data === "btn_leaderboard") {
      response = renderStudentLeaderboard(student, false);
    } else if (data === "leaderboard_more") {
      response = renderStudentLeaderboard(student, true);
    } else if (data.startsWith("start_exam_") || data.startsWith("resume_exam_")) {
      const examId = data.replace("start_exam_", "").replace("resume_exam_", "");
      response = handleStartOrResumeExam(examId, student, user);
    } else if (data.startsWith("reattempt_")) {
      const examId = data.replace("reattempt_", "");
      response = handleStartOrResumeExam(examId, student, user, true);
    } else if (data.startsWith("ans_")) {
      const rest = data.slice(4);
      const lastUnderscore = rest.lastIndexOf("_");
      if (lastUnderscore !== -1) {
        const optIdx = parseInt(rest.slice(lastUnderscore + 1), 10);
        const rem = rest.slice(0, lastUnderscore);
        const secondLastUnderscore = rem.lastIndexOf("_");
        if (secondLastUnderscore !== -1) {
          const qIdx = parseInt(rem.slice(secondLastUnderscore + 1), 10);
          const examId = rem.slice(0, secondLastUnderscore);
          response = handleOptionSelect(examId, qIdx, optIdx, student, user);
        }
      }
    } else if (data.startsWith("nav_")) {
      const rest = data.slice(4);
      const lastUnderscore = rest.lastIndexOf("_");
      if (lastUnderscore !== -1) {
        const targetIdx = parseInt(rest.slice(lastUnderscore + 1), 10);
        const examId = rest.slice(0, lastUnderscore);
        response = renderQuestionView(examId, targetIdx, student, user);
      }
    } else if (data.startsWith("grid_")) {
      const rest = data.slice(5);
      const lastUnderscore = rest.lastIndexOf("_");
      let examId = rest;
      let page = 0;
      if (lastUnderscore !== -1) {
        const maybePage = rest.slice(lastUnderscore + 1);
        if (/^\d+$/.test(maybePage)) {
          page = parseInt(maybePage, 10);
          examId = rest.slice(0, lastUnderscore);
        }
      }
      response = renderQuestionGrid(examId, student, user, page);
    } else if (data.startsWith("rev_")) {
      const rest = data.slice(4);
      const lastUnderscore = rest.lastIndexOf("_");
      if (lastUnderscore !== -1) {
        const examId = rest.slice(0, lastUnderscore);
        const pagePart = rest.slice(lastUnderscore + 1);
        const exam = store.getExamById(examId);
        const mine = store.getStudentAttempts(examId, student.telegramUserId).filter(
          (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"
        );
        const attempt = mine.find((a) => a.isOfficial !== false) || mine[mine.length - 1] || (exam ? store.getAttempt(examId, student.telegramUserId) : void 0);
        if (exam && attempt) {
          if (pagePart === "sum") {
            response = renderAttemptSummary(exam, attempt, null);
          } else {
            response = renderAttemptSummary(exam, attempt, parseInt(pagePart, 10) || 0);
          }
        }
      }
    } else if (data.startsWith("confirm_submit_")) {
      const examId = data.replace("confirm_submit_", "");
      response = renderSubmitConfirmation(examId, student, user);
    } else if (data.startsWith("do_submit_")) {
      const examId = data.replace("do_submit_", "");
      response = handleFinalSubmit(examId, student, user);
    }
    if (response && cbMessageId) {
      response.messageId = cbMessageId;
      response.type = "editMessageText";
    }
    return response;
  }
  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text.trim();
    const user = msg.from;
    const student = getOrCreateStudent(user);
    if (pendingNameUsers.has(user.id) && !text.startsWith("/")) {
      const newName = text.trim().slice(0, 60);
      if (newName.length < 2) {
        return {
          chatId: user.id,
          text: `\u270F\uFE0F Name is too short. Please send your full name (at least 2 characters).`,
          replyMarkup: {
            inline_keyboard: [[{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]]
          },
          type: "sendMessage"
        };
      }
      pendingNameUsers.delete(user.id);
      student.name = newName;
      store.saveStudent(student);
      return {
        chatId: user.id,
        text: `\u2705 *Name updated!*

Your name is now: *${newName}*

This will appear on results and the leaderboard.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }],
            [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]
          ]
        },
        type: "sendMessage"
      };
    }
    if (text.startsWith("/setname")) {
      const newName = text.replace("/setname", "").trim().slice(0, 60);
      if (newName) {
        pendingNameUsers.delete(user.id);
        student.name = newName;
        store.saveStudent(student);
        return {
          chatId: user.id,
          text: `\u2705 *Name updated!*

Your name is now: *${newName}*`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }],
              [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]
            ]
          },
          type: "sendMessage"
        };
      }
      pendingNameUsers.add(user.id);
      return {
        chatId: user.id,
        text: `\u270F\uFE0F *Set your name*

Please type your full name and send it as a message.`,
        replyMarkup: {
          inline_keyboard: [[{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]]
        },
        type: "sendMessage"
      };
    }
    if (text.startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      const payload = parts[1] || "";
      if (payload.startsWith("exam_")) {
        const examId = payload.slice(5);
        return handleStartOrResumeExam(examId, student, user);
      }
      const notice = store.getSettings().systemNotice;
      return {
        chatId: user.id,
        text: `\u{1F44B} *Welcome to Quiz Bot by Pusparghya!*

` + (notice ? `\u{1F4E2} ${notice}

` : "") + `You are registered as *${student.name}*.
Teachers share a special link for each exam. Open that link to start.
You can also view your past attempts below.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }],
            [{ text: "\u{1F4CA} My Results", callback_data: "btn_results" }],
            [{ text: "\u{1F3C6} Leaderboards", callback_data: "btn_leaderboard" }],
            [{ text: "\u270F\uFE0F Set your name", callback_data: "btn_setname" }]
          ]
        },
        type: "sendMessage"
      };
    }
    if (text === "/exams") {
      return renderExamsList(student);
    }
    if (text === "/results") {
      return renderStudentResults(student);
    }
    if (text === "/leaderboard") {
      return renderStudentLeaderboard(student, false);
    }
  }
  return null;
}
function renderExamsList(student) {
  const now = /* @__PURE__ */ new Date();
  const myAttempts = store.getAttempts().filter(
    (a) => a.telegramUserId === student.telegramUserId || a.studentId === student.studentId
  );
  const examIds = [...new Set(myAttempts.map((a) => a.examId))];
  const exams = examIds.map((id) => store.getExamById(id)).filter(Boolean);
  if (exams.length === 0) {
    return {
      chatId: student.telegramUserId,
      text: `\u{1F4DA} *My Exams*

You have no exams yet.

Ask your teacher for the *exam link*. Opening that link starts the exam.`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u{1F4CA} My Results", callback_data: "btn_results" }],
          [{ text: "\u{1F3C6} Leaderboards", callback_data: "btn_leaderboard" }]
        ]
      },
      type: "sendMessage"
    };
  }
  let text = `\u{1F4DA} *My Exams*

`;
  const keyboard = [];
  exams.forEach((exam, idx) => {
    const startDate = new Date(exam.startDate);
    const isLocked = now < startDate;
    const attempts = store.getStudentAttempts(exam.id, student.telegramUserId);
    const active = attempts.find((a) => a.status === "IN_PROGRESS");
    const officialDone = attempts.find((a) => a.isOfficial !== false && (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"));
    const anyDone = attempts.some((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED");
    text += `*${idx + 1}. ${exam.title}*
`;
    text += `   ${exam.subject || ""} \xB7 ${exam.totalQuestions} Qs \xB7 ${exam.durationMinutes} min
`;
    if (isLocked) {
      text += `   \u{1F512} Locked until ${formatInIST(startDate)}

`;
      keyboard.push([{ text: `\u{1F512} ${exam.title}`, callback_data: `start_exam_${exam.id}` }]);
    } else if (active) {
      text += `   \u26A1 In progress (${formatRemaining(active.expiresAt)} left)

`;
      keyboard.push([{ text: `\u25B6 Resume \xB7 ${exam.title}`, callback_data: `resume_exam_${exam.id}` }]);
    } else if (anyDone) {
      const score = officialDone ? `${officialDone.score}/${officialDone.maxScore}` : "done";
      text += `   \u2705 Attempted (${score}) \u2014 you can reattempt for practice

`;
      keyboard.push([
        { text: `\u{1F4CA} Result \xB7 ${exam.title}`, callback_data: `start_exam_${exam.id}` },
        { text: `\u{1F501} Reattempt`, callback_data: `reattempt_${exam.id}` }
      ]);
    } else {
      text += `   \u{1F7E2} Ready to start

`;
      keyboard.push([{ text: `\u{1F680} Start \xB7 ${exam.title}`, callback_data: `start_exam_${exam.id}` }]);
    }
  });
  keyboard.push([{ text: "\u{1F4CA} My Results", callback_data: "btn_results" }]);
  keyboard.push([{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]);
  return {
    chatId: student.telegramUserId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: "editMessageText"
  };
}
function handleStartOrResumeExam(examId, student, user, forceNew = false) {
  const now = /* @__PURE__ */ new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return {
      chatId: user.id,
      text: `\u274C *Exam not found*

Ask your teacher for a valid exam link.`,
      type: "sendMessage"
    };
  }
  if (!exam.teacherId) {
    return {
      chatId: user.id,
      text: `\u274C This exam is not available.`,
      type: "sendMessage"
    };
  }
  const startDate = new Date(exam.startDate);
  if (now < startDate) {
    return {
      chatId: user.id,
      text: `\u{1F512} *Exam locked until start time*

\u{1F4DD} *${exam.title}*
\u{1F4C5} Starts: ${formatInIST(startDate)}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u{1F504} Check again", callback_data: `start_exam_${exam.id}` }],
          [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]
        ]
      },
      type: "sendMessage"
    };
  }
  linkStudentToTeacher(student, exam.teacherId);
  let attempt = store.getAttempt(examId, student.telegramUserId);
  const allMine = store.getStudentAttempts(examId, student.telegramUserId);
  const officialExists = allMine.some((a) => a.isOfficial !== false && (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"));
  if (!forceNew && attempt && (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED")) {
    return renderAttemptSummary(exam, attempt);
  }
  if (!forceNew && attempt && attempt.status === "IN_PROGRESS") {
    if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
      return autoSubmitExam(exam, attempt);
    }
    return renderQuestionView(exam.id, attempt.currentQuestionIndex, student, user);
  }
  const attemptNumber = allMine.length + 1;
  const windowOpen = isExamWindowOpen(exam, now.getTime());
  const isOfficial = windowOpen && !officialExists;
  if (!windowOpen && !officialExists && !forceNew) {
  }
  const startedAt = now.toISOString();
  const { end: windowEnd } = getExamWindow(exam);
  let expiresMs = now.getTime() + Math.max(1, exam.durationMinutes || 60) * 60 * 1e3;
  if (isOfficial) {
    expiresMs = Math.min(expiresMs, windowEnd);
  }
  const expiresAt = new Date(expiresMs).toISOString();
  attempt = {
    id: `ATT_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
    examId,
    studentId: student.studentId,
    telegramUserId: student.telegramUserId,
    studentName: student.name,
    studentClass: student.className,
    startedAt,
    expiresAt,
    submittedAt: null,
    status: "IN_PROGRESS",
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
  store.addAuditLog("EXAM_STARTED", `${student.name} started ${exam.title} (attempt #${attemptNumber}, official=${isOfficial})`);
  if (!isOfficial) {
    return {
      chatId: user.id,
      text: windowOpen ? `\u{1F501} *Practice attempt*

This will *not* count on the leaderboard (you already have an official attempt).

\u{1F4DD} ${exam.title}` : `\u{1F501} *Practice mode*

The official exam window has ended.
\u{1F4C5} Window: ${formatInIST(new Date(getExamWindow(exam).start))} \u2192 ${formatInIST(new Date(getExamWindow(exam).end))}

You can still practice \u2014 scores will *not* affect the leaderboard.

\u{1F4DD} ${exam.title}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u25B6 Continue to questions", callback_data: `resume_exam_${exam.id}` }],
          [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]
        ]
      },
      type: "sendMessage"
    };
  }
  return renderQuestionView(exam.id, 0, student, user);
}
function handleOptionSelect(examId, qIdx, optIdx, student, user) {
  const now = /* @__PURE__ */ new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: "\u274C Examination not found. Please type /exams to see available tests.", type: "sendMessage" };
  }
  linkStudentToTeacher(student, exam.teacherId);
  let attempt = store.getAttempt(examId, student.telegramUserId);
  if (!attempt) {
    const startRes = handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId);
    if (!attempt) {
      return startRes;
    }
  }
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return autoSubmitExam(exam, attempt);
  }
  if (attempt.status !== "IN_PROGRESS") {
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
function renderQuestionView(examId, qIdx, student, user) {
  const now = /* @__PURE__ */ new Date();
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: "\u274C Examination not found. Please type /exams to see available tests.", type: "sendMessage" };
  }
  linkStudentToTeacher(student, exam.teacherId);
  let attempt = store.getAttempt(examId, student.telegramUserId);
  if (!attempt) {
    const startRes = handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId);
    if (!attempt) {
      return startRes;
    }
  }
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    return autoSubmitExam(exam, attempt);
  }
  attempt.currentQuestionIndex = qIdx;
  store.saveAttempt(attempt);
  const total = exam.questions.length;
  const question = exam.questions[qIdx];
  const selectedOpt = attempt.answers[question.id];
  const remaining = formatRemaining(attempt.expiresAt);
  let text = `\u{1F4DD} *${exam.title}*
`;
  text += `\u23F1\uFE0F *${remaining} remaining* | Question ${qIdx + 1}/${total}

`;
  text += `${question.question}

`;
  if (selectedOpt !== void 0) {
    text += `*Your Selected Answer:* Option ${String.fromCharCode(65 + selectedOpt)}: ${question.options[selectedOpt]}
`;
  } else {
    text += `*Status:* \u26AA Unanswered
`;
  }
  const keyboard = [];
  question.options.forEach((optText, oIdx) => {
    const isSelected = selectedOpt === oIdx;
    const prefix = isSelected ? "\u{1F518} " : "\u26AA ";
    let label = `${prefix}${String.fromCharCode(65 + oIdx)}. ${optText}`;
    if (label.length > 60) label = label.slice(0, 57) + "\u2026";
    keyboard.push([{
      text: label,
      callback_data: `ans_${exam.id}_${qIdx}_${oIdx}`
    }]);
  });
  const navRow = [];
  if (qIdx > 0) {
    navRow.push({ text: "\u25C0 Previous", callback_data: `nav_${exam.id}_${qIdx - 1}` });
  }
  if (qIdx < total - 1) {
    navRow.push({ text: "Next \u25B6", callback_data: `nav_${exam.id}_${qIdx + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }
  keyboard.push([
    { text: "\u{1F4CB} Question Grid", callback_data: `grid_${exam.id}` },
    { text: "\u2705 Submit Exam", callback_data: `confirm_submit_${exam.id}` }
  ]);
  keyboard.push([{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]);
  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: "editMessageText"
  };
}
function renderQuestionGrid(examId, student, user, page = 0) {
  const exam = store.getExamById(examId);
  if (!exam) {
    return { chatId: user.id, text: "\u274C Examination not found.", type: "sendMessage" };
  }
  let attempt = store.getAttempt(examId, student.telegramUserId);
  if (!attempt) {
    handleStartOrResumeExam(examId, student, user);
    attempt = store.getAttempt(examId, student.telegramUserId);
    if (!attempt) {
      return { chatId: user.id, text: "\u274C Exam session missing.", type: "sendMessage" };
    }
  }
  const answeredCount = Object.keys(attempt.answers || {}).length;
  const total = exam.questions.length;
  const remaining = formatRemaining(attempt.expiresAt);
  const PER_PAGE = 16;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const start = p * PER_PAGE;
  const end = Math.min(start + PER_PAGE, total);
  let text = `\u{1F4CB} *Question Review Grid*
`;
  text += `\u{1F4DD} *${escapeMd(exam.title)}*
`;
  text += `\u23F1\uFE0F Time Remaining: *${remaining}*
`;
  text += `\u{1F7E2} Answered: ${answeredCount}/${total} | \u26AA Unanswered: ${total - answeredCount}
`;
  text += `\u{1F4C4} Page ${p + 1}/${totalPages} (Q${start + 1}\u2013Q${end})

`;
  text += `Tap a question number to jump to it:`;
  const keyboard = [];
  let currentRow = [];
  for (let idx = start; idx < end; idx++) {
    const q = exam.questions[idx];
    const isAnswered = attempt.answers?.[q.id] !== void 0;
    const isCurrent = attempt.currentQuestionIndex === idx;
    let label = isAnswered ? `\u{1F7E2} Q${idx + 1}` : `\u26AA Q${idx + 1}`;
    if (isCurrent) label = `\u{1F449} Q${idx + 1}`;
    currentRow.push({
      text: label,
      callback_data: `nav_${exam.id}_${idx}`
    });
    if (currentRow.length === 4 || idx === end - 1) {
      keyboard.push(currentRow);
      currentRow = [];
    }
  }
  const nav = [];
  if (p > 0) nav.push({ text: "\u25C0 Prev page", callback_data: `grid_${exam.id}_${p - 1}` });
  if (p < totalPages - 1) nav.push({ text: "Next page \u25B6", callback_data: `grid_${exam.id}_${p + 1}` });
  if (nav.length) keyboard.push(nav);
  keyboard.push([
    { text: "\u{1F519} Back to question", callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex}` },
    { text: "\u2705 Submit Exam", callback_data: `confirm_submit_${exam.id}` }
  ]);
  keyboard.push([{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]);
  return {
    chatId: user.id,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: "editMessageText"
  };
}
function renderSubmitConfirmation(examId, student, user) {
  const exam = store.getExamById(examId);
  const attempt = store.getAttempt(examId, student.telegramUserId);
  if (!exam || !attempt) {
    return { chatId: user.id, text: "\u274C Exam session missing.", type: "sendMessage" };
  }
  const answeredCount = Object.keys(attempt.answers).length;
  const total = exam.questions.length;
  const unansweredCount = total - answeredCount;
  const remaining = formatRemaining(attempt.expiresAt);
  let text = `\u26A0\uFE0F *Confirm Submission*

`;
  text += `\u{1F4DD} *${exam.title}*
`;
  text += `\u23F1\uFE0F Time Remaining: *${remaining}*

`;
  text += `\u{1F4CA} *Summary:* 
`;
  text += `\u{1F7E2} Answered Questions: *${answeredCount}*
`;
  text += `\u26AA Skipped/Unanswered: *${unansweredCount}*

`;
  text += `Are you sure you want to finalize and submit your examination now?`;
  return {
    chatId: user.id,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "\u{1F680} Yes, Submit Exam Now", callback_data: `do_submit_${exam.id}` }],
        [{ text: "\u{1F519} Continue Answering", callback_data: `nav_${exam.id}_${attempt.currentQuestionIndex}` }],
        [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]
      ]
    },
    type: "editMessageText"
  };
}
function handleFinalSubmit(examId, student, user) {
  const now = /* @__PURE__ */ new Date();
  const exam = store.getExamById(examId);
  const attempt = store.getAttempt(examId, student.telegramUserId);
  if (!exam || !attempt) {
    return { chatId: user.id, text: "\u274C Exam session missing.", type: "sendMessage" };
  }
  if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
    return renderAttemptSummary(exam, attempt);
  }
  const startMs = new Date(attempt.startedAt).getTime();
  const timeTakenSecs = Math.max(1, Math.floor((now.getTime() - startMs) / 1e3));
  const stats = calculateAttemptScore(exam, attempt.answers, timeTakenSecs);
  attempt.status = "SUBMITTED";
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
  store.addAuditLog("EXAM_SUBMITTED", `Student ${student.name} (${student.studentId}) submitted ${exam.title} with score ${attempt.score}/${attempt.maxScore}`);
  return renderAttemptSummary(exam, attempt);
}
function autoSubmitExam(exam, attempt) {
  const now = /* @__PURE__ */ new Date();
  const startMs = new Date(attempt.startedAt).getTime();
  const timeTakenSecs = Math.floor((new Date(attempt.expiresAt).getTime() - startMs) / 1e3);
  const stats = calculateAttemptScore(exam, attempt.answers, timeTakenSecs);
  attempt.status = "AUTO_SUBMITTED";
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
  store.addAuditLog("EXAM_AUTO_SUBMITTED", `Exam ${exam.title} auto-submitted for ${attempt.studentName} due to time expiration`);
  return renderAttemptSummary(exam, attempt);
}
function renderAttemptSummary(exam, attempt, reviewPage = null) {
  const chatId = attempt.telegramUserId;
  let text = `\u{1F389} *Exam submitted*

`;
  text += `\u{1F4DD} *${escapeMd(exam.title)}*
`;
  text += `\u{1F464} *${escapeMd(attempt.studentName || "")}*
`;
  if (attempt.attemptNumber && attempt.attemptNumber > 1) {
    text += `\u{1F501} Practice attempt #${attempt.attemptNumber} (not ranked)
`;
  }
  text += `\u{1F4CC} ${attempt.status === "AUTO_SUBMITTED" ? "\u23F0 Auto-submitted (time up)" : "\u2705 Submitted"}

`;
  const keyboard = [];
  if (exam.resultVisibility === "PUBLISHED") {
    text += `\u{1F4CA} *Your score*
`;
    text += `\u2B50 ${attempt.score} / ${attempt.maxScore} (${attempt.percentage}%)
`;
    text += `\u2705 ${attempt.correctCount}  \u274C ${attempt.wrongCount}  \u26AA ${attempt.skippedCount}
`;
    const mins = Math.floor(attempt.timeTakenSeconds / 60);
    const secs = attempt.timeTakenSeconds % 60;
    text += `\u23F1\uFE0F Time: ${mins}m ${secs}s
`;
    if (attempt.isOfficial !== false && isExamTimeEnded(exam) && attempt.rank) {
      text += `\u{1F3C6} Rank: #${attempt.rank}
`;
    } else if (attempt.isOfficial !== false && !isExamTimeEnded(exam)) {
      text += `\u{1F3C6} Rank after exam ends
`;
    }
    const totalQ = exam.questions.length;
    const PER_PAGE = 5;
    const totalPages = Math.max(1, Math.ceil(totalQ / PER_PAGE));
    if (reviewPage === null) {
      text += `
\u{1F4D6} Tap *Review answers* to see each question (page by page).`;
      if (totalQ > 0) {
        keyboard.push([{ text: `\u{1F4D6} Review answers (1/${totalPages})`, callback_data: `rev_${exam.id}_0` }]);
      }
    } else {
      const page = Math.max(0, Math.min(reviewPage, totalPages - 1));
      const start = page * PER_PAGE;
      const end = Math.min(start + PER_PAGE, totalQ);
      text += `
*Questions ${start + 1}\u2013${end} of ${totalQ}* (page ${page + 1}/${totalPages})

`;
      for (let i = start; i < end; i++) {
        const q = exam.questions[i];
        const sel = attempt.answers?.[q.id];
        const has = sel !== void 0 && sel !== null;
        let mark = "\u26AA";
        let extra = "Skipped";
        if (has) {
          const ok = q.answer !== null && sel === q.answer;
          mark = ok ? "\u2705" : "\u274C";
          const chosen = q.options?.[sel] ?? `opt ${sel}`;
          const correct = q.answer !== null && q.options?.[q.answer] !== void 0 ? q.options[q.answer] : "\u2014";
          const cShort = String(chosen).slice(0, 40);
          const rShort = String(correct).slice(0, 40);
          extra = ok ? `Yours: ${cShort}` : `Yours: ${cShort} \xB7 Correct: ${rShort}`;
        }
        const short = escapeMd((q.question || "").slice(0, 50));
        text += `${mark} *Q${i + 1}.* ${short}${(q.question || "").length > 50 ? "\u2026" : ""}
   ${escapeMd(extra)}
`;
      }
      const nav = [];
      if (page > 0) {
        nav.push({ text: "\u25C0 Previous", callback_data: `rev_${exam.id}_${page - 1}` });
      }
      if (page < totalPages - 1) {
        nav.push({ text: "Next \u25B6", callback_data: `rev_${exam.id}_${page + 1}` });
      }
      if (nav.length) keyboard.push(nav);
      keyboard.push([{ text: "\u{1F4CA} Score summary", callback_data: `rev_${exam.id}_sum` }]);
    }
  } else {
    text += `\u{1F512} Results are hidden by the teacher for now.
`;
  }
  keyboard.push([{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }]);
  keyboard.push([{ text: "\u{1F3C6} Leaderboard", callback_data: "btn_leaderboard" }]);
  keyboard.push([{ text: "\u{1F501} Reattempt (practice)", callback_data: `reattempt_${exam.id}` }]);
  keyboard.push([{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]);
  if (text.length > 3900) {
    text = text.slice(0, 3890) + "\n\u2026";
  }
  return {
    chatId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: "editMessageText"
  };
}
function renderStudentResults(student) {
  const attempts = store.getAttempts().filter(
    (a) => (a.telegramUserId === student.telegramUserId || a.studentId === student.studentId) && (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED")
  ).slice().sort((a, b) => {
    const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return tb - ta;
  });
  if (attempts.length === 0) {
    return {
      chatId: student.telegramUserId,
      text: `\u{1F4CA} *My Results*

You have not submitted any exams yet.
Open the link from your teacher to start.`,
      replyMarkup: { inline_keyboard: [[{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }]] },
      type: "sendMessage"
    };
  }
  const MAX_LIST = 12;
  const shown = attempts.slice(0, MAX_LIST);
  let text = `\u{1F4CA} *My Results \u2014 ${escapeMd(student.name)}*

`;
  text += `_Showing ${shown.length} of ${attempts.length}. Tap an exam to open score & answers._

`;
  const keyboard = [];
  shown.forEach((att, idx) => {
    const exam = store.getExamById(att.examId);
    const title = exam ? exam.title : att.examId;
    const practice = att.isOfficial === false ? " (practice)" : "";
    let line = `*${idx + 1}. ${escapeMd(title)}*${practice}
`;
    if (exam && exam.resultVisibility === "PUBLISHED") {
      line += `   Score: *${att.score}/${att.maxScore}* (${att.percentage}%)`;
      if (att.isOfficial !== false && isExamTimeEnded(exam) && att.rank) {
        line += ` \xB7 Rank #${att.rank}`;
      }
      line += `
`;
    } else {
      line += `   \u{1F512} Results hidden
`;
    }
    text += line;
    if (exam && exam.resultVisibility === "PUBLISHED") {
      keyboard.push([
        {
          text: `\u{1F4D6} ${idx + 1}. ${(title || "Exam").slice(0, 28)}`,
          callback_data: `rev_${att.examId}_sum`
        }
      ]);
    }
  });
  if (text.length > 3500) text = text.slice(0, 3490) + "\n\u2026";
  keyboard.push([{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }]);
  keyboard.push([{ text: "\u{1F3C6} Leaderboard", callback_data: "btn_leaderboard" }]);
  keyboard.push([{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]);
  return {
    chatId: student.telegramUserId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: "editMessageText"
  };
}
function renderStudentLeaderboard(student, showAll = false) {
  const myExamIds = [...new Set(
    store.getAttempts().filter((a) => a.telegramUserId === student.telegramUserId || a.studentId === student.studentId).map((a) => a.examId)
  )];
  const exams = myExamIds.map((id) => store.getExamById(id)).filter((e) => !!e && isExamTimeEnded(e));
  if (exams.length === 0) {
    return {
      chatId: student.telegramUserId,
      text: `\u{1F3C6} *Leaderboard*

Rankings appear only *after an exam ends*.`,
      replyMarkup: { inline_keyboard: [
        [{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }],
        [{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }]
      ] },
      type: "editMessageText"
    };
  }
  let text = `\u{1F3C6} *Leaderboard*
_(First attempt only)_

`;
  let hasMore = false;
  const keyboard = [];
  exams.forEach((exam) => {
    text += `\u{1F4DD} *${exam.title}*
`;
    const attempts = store.getAttempts(exam.id).filter((a) => (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED") && a.isOfficial !== false).slice().sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
      return 0;
    });
    if (attempts.length === 0) {
      text += `   _No ranked submissions._

`;
      return;
    }
    const limit = showAll ? attempts.length : 10;
    if (!showAll && attempts.length > 10) hasMore = true;
    attempts.slice(0, limit).forEach((att, idx) => {
      const rankNum = att.rank || idx + 1;
      const medal = rankNum === 1 ? "\u{1F947}" : rankNum === 2 ? "\u{1F948}" : rankNum === 3 ? "\u{1F949}" : `#${rankNum}`;
      const isMe = att.telegramUserId === student.telegramUserId || att.studentId === student.studentId ? " (You)" : "";
      text += `   ${medal} ${att.studentName}${isMe} \u2014 *${att.score}* (${att.percentage}%)
`;
    });
    if (!showAll && attempts.length > 10) {
      text += `   _\u2026and ${attempts.length - 10} more_
`;
    }
    text += `
`;
  });
  if (hasMore && !showAll) {
    keyboard.push([{ text: "Show full leaderboard", callback_data: "leaderboard_more" }]);
  }
  keyboard.push([{ text: "\u{1F4DA} My Exams", callback_data: "btn_exams" }]);
  keyboard.push([{ text: "\u{1F3E0} Main menu", callback_data: "btn_home" }]);
  return {
    chatId: student.telegramUserId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
    type: "editMessageText"
  };
}
async function sendTelegramResponse(resp) {
  const token = process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken;
  if (!token) return;
  const preferEdit = resp.type === "editMessageText" && !!resp.messageId;
  const result = await sendSafeTelegramMessage(token, resp.chatId, resp.text || "", {
    parseMode: "Markdown",
    replyMarkup: resp.replyMarkup,
    messageId: resp.messageId,
    preferEdit
  });
  if (!result.ok) {
    console.warn("[Telegram] send failed:", result.error);
  }
}

// src/telegram/polling.ts
var isPollingRunning = false;
function startTelegramPolling() {
  if (isPollingRunning) {
    console.warn("[Telegram Bot Engine] Polling already running \u2014 skip duplicate worker");
    return;
  }
  if (process.env.TELEGRAM_POLLING_ENABLED === "false") {
    console.log("[Telegram Bot Engine] TELEGRAM_POLLING_ENABLED=false \u2014 polling disabled");
    return;
  }
  isPollingRunning = true;
  console.log("[Telegram Bot Engine] Starting live Telegram long polling service...");
  let offset = 0;
  const pollLoop = async () => {
    while (true) {
      const settings = store.getSettings();
      const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken;
      if (!token || !settings.botActive) {
        await new Promise((resolve) => setTimeout(resolve, 3e3));
        continue;
      }
      try {
        const url2 = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`;
        const res = await fetch(url2);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error_code === 409) {
            console.log("[Telegram Bot Engine] Webhook conflict detected. Deleting webhook to switch to polling...");
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`).catch(() => {
            });
            await new Promise((resolve) => setTimeout(resolve, 1e3));
            continue;
          } else {
            console.warn("[Telegram Bot Engine] Polling warning:", errData.description || res.statusText);
            await new Promise((resolve) => setTimeout(resolve, 5e3));
            continue;
          }
        }
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            if (update.callback_query?.id) {
              fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: update.callback_query.id })
              }).catch(() => {
              });
            }
            try {
              const response = await processTelegramUpdate(update);
              if (response) {
                await sendTelegramResponse(response);
              }
            } catch (procErr) {
              console.error("[Telegram Bot Engine] Error processing update:", procErr);
            }
          }
        }
      } catch (err) {
        console.error("[Telegram Bot Engine] Polling fetch error:", err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, 5e3));
      }
    }
  };
  pollLoop();
}

// src/services/geminiOcr.ts
import { GoogleGenAI, Type } from "@google/genai";
async function parseQuestionsFromMedia(fileBase64, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "QuizBotByPusparghya"
      }
    }
  });
  const promptText = `Extract all multiple choice examination questions from this question paper document/image into structured JSON.

CRITICAL RULES:
1. Preserve the exact original question text cleanly.
2. Preserve the exact original option text and order. Always extract options into an array of strings.
3. "answer" must be a 0-based integer index corresponding to the correct option:
   - 0 = Option A / First option
   - 1 = Option B / Second option
   - 2 = Option C / Third option
   - 3 = Option D / Fourth option
   - Use null if the correct answer key is not explicitly provided in the question paper. NEVER guess or invent an answer if it is not explicitly marked or provided!
4. Default "marks" to 1 unless explicitly specified otherwise.
5. Default "negativeMarks" to 0 unless explicitly specified otherwise.
6. Extract EVERY single question accurately without skipping.`;
  const imagePart = {
    inlineData: {
      mimeType: mimeType || "image/jpeg",
      data: fileBase64
    }
  };
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: {
      parts: [imagePart, { text: promptText }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING, description: "Preserved question text" },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of option choices"
                },
                answer: {
                  type: Type.INTEGER,
                  nullable: true,
                  description: "0-based index of correct option, or null if unknown"
                },
                marks: { type: Type.NUMBER, description: "Marks for correct answer" },
                negativeMarks: { type: Type.NUMBER, description: "Negative marks for wrong answer" }
              },
              required: ["question", "options"]
            }
          }
        },
        required: ["questions"]
      }
    }
  });
  const responseText = response.text || "{}";
  try {
    const parsed = JSON.parse(responseText);
    return parsed;
  } catch (err) {
    console.error("Failed to parse Gemini OCR JSON output:", responseText);
    throw new Error("Failed to parse structured questions from OCR response.");
  }
}

// src/jobs/broadcastQueue.ts
var queue = [];
var running = false;
function enqueueBroadcast(job) {
  queue.push(job);
  void processQueue();
  return job.id;
}
async function processQueue() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      const token = process.env.TELEGRAM_BOT_TOKEN || store.getSettings().telegramBotToken;
      let sent = 0;
      let failed = 0;
      await db.execute({
        sql: `INSERT OR REPLACE INTO broadcast_jobs (id, teacher_id, message, status, total, sent, failed, created_at)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [job.id, job.teacherId, job.message, "running", job.recipients.length, 0, 0, (/* @__PURE__ */ new Date()).toISOString()]
      }).catch(() => {
      });
      for (const tg of job.recipients) {
        if (!token) {
          failed++;
          continue;
        }
        const r = await sendSafeTelegramMessage(token, tg, job.message, { parseMode: "Markdown" });
        if (r.ok) sent++;
        else failed++;
        await new Promise((res) => setTimeout(res, 45));
      }
      await db.execute({
        sql: `UPDATE broadcast_jobs SET status='done', sent=?, failed=?, finished_at=? WHERE id=?`,
        args: [sent, failed, (/* @__PURE__ */ new Date()).toISOString(), job.id]
      }).catch(() => {
      });
      store.addAuditLog("BROADCAST", `Broadcast ${job.id}: sent=${sent} failed=${failed}`, job.teacherId);
      console.log(`[broadcast] ${job.id} sent=${sent} failed=${failed}`);
    }
  } finally {
    running = false;
  }
}

// src/index.ts
dotenv3.config();
async function startServer(app) {
  const owned = !app;
  app = app || express();
  app.use(cors({ origin: corsOriginDelegate, credentials: true }));
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: true, limit: "12mb" }));
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "quiz-bot-api" }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1e3, max: 30, keyFn: (req) => `auth:${req.ip}` });
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const result = await loginTeacher(username, password);
      res.json(result);
    } catch (e) {
      res.status(401).json({ error: e.message || "Login failed" });
    }
  });
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { username, password, name } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const result = await registerTeacher(username, password, name || username);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message || "Registration failed" });
    }
  });
  app.get("/api/auth/me", authMiddleware, (req, res) => {
    res.json({ teacher: req.teacher });
  });
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || req.path.startsWith("/telegram")) return next();
    return authMiddleware(req, res, next);
  });
  app.get("/api/data", (req, res) => {
    const teacher = req.teacher;
    const teacherId = teacher?.username;
    let exams = store.getExams();
    if (teacherId) {
      exams = exams.filter((e) => e.teacherId === teacherId);
    } else {
      exams = [];
    }
    exams = exams.map((e) => withEffectiveStatus(e));
    const examIds = new Set(exams.map((e) => e.id));
    const attempts = store.getAttempts().filter((a) => examIds.has(a.examId));
    const attemptTgIds = /* @__PURE__ */ new Set();
    const attemptStudentIds = /* @__PURE__ */ new Set();
    for (const a of attempts) {
      if (a.telegramUserId) attemptTgIds.add(Number(a.telegramUserId));
      if (a.studentId) attemptStudentIds.add(String(a.studentId));
    }
    let students = store.getStudents();
    if (teacherId) {
      students = students.filter((s) => {
        if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
        if (s.telegramUserId && attemptTgIds.has(Number(s.telegramUserId))) return true;
        if (s.studentId && attemptStudentIds.has(String(s.studentId))) return true;
        return false;
      });
      const seen = /* @__PURE__ */ new Set();
      students = students.filter((s) => {
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
      // Never expose full bot token to the browser
      telegramBotToken: rawSettings.telegramBotToken ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
      botUsername: rawSettings.botUsername || "@quizbotbypusparghya_bot",
      botActive: true
    };
    res.json({
      exams,
      questions: [],
      students,
      attempts,
      settings,
      auditLogs: store.getAuditLogs().filter((l) => !teacherId || (l.details || "").includes(teacherId) || l.actor === teacherId).slice(0, 30)
    });
  });
  app.post("/api/reseed", (req, res) => {
    if (!env.enableDangerousReseed) {
      return res.status(403).json({ error: "Reseed disabled. Set ENABLE_RESEED=true to allow." });
    }
    const fresh = store.resetToSeed();
    store.addAuditLog("SYSTEM_RESEEDED", "Reseeded database to clean state");
    res.json(fresh);
  });
  app.get("/api/stats", (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exams = store.getExams().filter((e) => e.teacherId === teacherId);
    const students = store.getStudents();
    const attempts = store.getAttempts();
    const activeExamsCount = exams.filter((e) => {
      const s = effectiveExamStatus(e);
      return s === "LIVE" || s === "SCHEDULED";
    }).length;
    const completedAttemptsCount = attempts.filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED").length;
    let totalPctSum = 0;
    const finishedAttempts = attempts.filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED");
    finishedAttempts.forEach((a) => {
      totalPctSum += a.percentage;
    });
    const avgPercentage = finishedAttempts.length > 0 ? Math.round(totalPctSum / finishedAttempts.length * 10) / 10 : 0;
    const linkedStudentsCount = students.filter((s) => s.status === "linked").length;
    res.json({
      totalExams: exams.length,
      activeExamsCount,
      totalStudents: students.length,
      linkedStudentsCount,
      totalSubmissions: completedAttemptsCount,
      avgPercentage,
      questionBankCount: store.getQuestionBank().length,
      classes: ["Class 10-A Biology", "Class 12-B Physics"]
    });
  });
  app.get("/api/exams", (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    let exams = store.getExams().filter((e) => e.teacherId === teacherId);
    const { className, status } = req.query;
    if (className) {
      exams = exams.filter((e) => e.className === className);
    }
    if (status) {
      exams = exams.filter((e) => effectiveExamStatus(e) === status);
    }
    exams = exams.map((e) => withEffectiveStatus(e));
    res.json(exams);
  });
  app.get("/api/exams/:id", (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exam = getOwnedExam(req.params.id, teacherId);
    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }
    const attempts = store.getAttempts(exam.id);
    res.json({ exam, attempts });
  });
  app.post("/api/exams", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const data = req.body;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const teacher = req.teacher;
    const newExam = {
      id: `EXAM_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
      teacherId,
      title: data.title || "Untitled Examination",
      subject: data.subject || "General",
      className: data.className || "Class 10-A Biology",
      testNumber: data.testNumber || "Test 01",
      totalQuestions: data.questions ? data.questions.length : 0,
      startDate: data.startDate || now,
      durationMinutes: Number(data.durationMinutes) || 60,
      totalMarks: Number(data.totalMarks) || (data.questions ? data.questions.length : 0),
      negativeMarking: Number(data.negativeMarking) || 0,
      randomizeQuestions: !!data.randomizeQuestions,
      randomizeOptions: !!data.randomizeOptions,
      resultVisibility: data.resultVisibility || "PUBLISHED",
      leaderboardVisibility: data.leaderboardVisibility || "PUBLISHED",
      status: effectiveExamStatus({ startDate: data.startDate || now, durationMinutes: Number(data.durationMinutes) || 60 }),
      questions: data.questions || [],
      createdAt: now,
      updatedAt: now
    };
    await store.saveExam(newExam);
    await store.addAuditLog("EXAM_CREATED", `Created exam "${newExam.title}" for ${newExam.className}`, teacherId);
    res.json(withEffectiveStatus(newExam));
  });
  app.put("/api/exams/:id", async (req, res) => {
    const exam = store.getExamById(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    if (exam.teacherId && exam.teacherId !== teacherId) {
      return res.status(403).json({ error: "Not your exam" });
    }
    const updated = {
      ...exam,
      ...req.body,
      teacherId: exam.teacherId || teacherId,
      id: exam.id,
      totalQuestions: req.body.questions ? req.body.questions.length : exam.totalQuestions,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updated.status = effectiveExamStatus(updated);
    await store.saveExam(updated);
    await store.addAuditLog("EXAM_UPDATED", `Updated exam "${updated.title}" (${updated.status})`, teacherId);
    res.json(withEffectiveStatus(updated));
  });
  app.delete("/api/exams/:id", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exam = getOwnedExam(req.params.id, teacherId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    await store.deleteExam(req.params.id);
    await store.addAuditLog("EXAM_DELETED", `Deleted exam "${exam.title}"`, teacherId);
    return res.json({ success: true });
  });
  app.post("/api/exams/:id/recalculate", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const exam = getOwnedExam(req.params.id, teacherId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
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
    await store.addAuditLog("EXAM_RECALCULATED", `Recalculated scores and rankings for ${exam.title}`, teacherId);
    res.json({ success: true, count: attempts.length });
  });
  app.get("/api/questions", (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const qs = store.getQuestionBank().filter((q) => q.teacherId === teacherId);
    res.json(qs);
  });
  app.post("/api/questions", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const qData = req.body;
    const newQuestion = {
      id: `QB_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
      teacherId,
      question: qData.question,
      options: qData.options || ["Option A", "Option B", "Option C", "Option D"],
      answer: qData.answer !== void 0 ? qData.answer : null,
      marks: Number(qData.marks) || 1,
      negativeMarks: Number(qData.negativeMarks) || 0,
      subject: qData.subject || "General",
      explanation: qData.explanation
    };
    await store.saveQuestion(newQuestion);
    await store.addAuditLog("QUESTION_ADDED", `Added question to bank: "${newQuestion.question.substring(0, 40)}..."`, teacherId);
    res.json(newQuestion);
  });
  app.put("/api/questions/:id", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const q = store.getQuestionBank().find((item) => item.id === req.params.id);
    if (!q || !questionBelongsToTeacher(q, teacherId)) return res.status(404).json({ error: "Question not found" });
    const updated = { ...q, ...req.body, teacherId, id: q.id };
    await store.saveQuestion(updated);
    res.json(updated);
  });
  app.delete("/api/questions/:id", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const q = store.getQuestionBank().find((item) => item.id === req.params.id);
    if (!q || !questionBelongsToTeacher(q, teacherId)) return res.status(404).json({ error: "Question not found" });
    await store.deleteQuestion(req.params.id);
    res.json({ success: true });
  });
  app.post("/api/questions/import-json", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Payload must contain a "questions" array.' });
    }
    const imported = [];
    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const formatted = {
        id: `QB_${Date.now()}_${idx}_${Math.floor(Math.random() * 1e3)}`,
        teacherId,
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) ? q.options : ["Option A", "Option B", "Option C", "Option D"],
        answer: q.answer !== void 0 && q.answer !== null ? Number(q.answer) : null,
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        subject: q.subject || "General"
      };
      await store.saveQuestion(formatted);
      imported.push(formatted);
    }
    await store.addAuditLog("JSON_IMPORTED", `Imported ${imported.length} questions via JSON format`, teacherId);
    res.json({ success: true, count: imported.length, questions: imported });
  });
  const ocrLimiter = rateLimit({ windowMs: 15 * 60 * 1e3, max: 20, keyFn: (req) => `ocr:${req.teacher?.username || req.ip}` });
  app.post("/api/ocr/parse", ocrLimiter, async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || typeof fileBase64 !== "string") {
        return res.status(400).json({ error: "fileBase64 required" });
      }
      if (fileBase64.length > env.maxOcrBase64Chars) {
        return res.status(413).json({ error: "Image too large" });
      }
      if (!fileBase64) {
        return res.status(400).json({ error: "fileBase64 string is required." });
      }
      const result = await parseQuestionsFromMedia(fileBase64, mimeType || "image/jpeg");
      store.addAuditLog("OCR_PARSED", `Extracted ${result.questions?.length || 0} questions via Gemini OCR`);
      res.json(result);
    } catch (err) {
      console.error("OCR error:", err);
      res.status(500).json({ error: err.message || "Failed to extract questions using AI OCR." });
    }
  });
  app.get("/api/students", (req, res) => {
    const teacherId = req.teacher?.username;
    let students = store.getStudents();
    if (teacherId) {
      const myExamIds = new Set(store.getExams().filter((e) => e.teacherId === teacherId).map((e) => e.id));
      const myAttempts = store.getAttempts().filter((a) => myExamIds.has(a.examId));
      students = students.filter((s) => {
        if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
        return myAttempts.some((a) => a.studentId === s.studentId || s.telegramUserId && a.telegramUserId === s.telegramUserId);
      });
    }
    const { className, search, status } = req.query;
    if (className) {
      students = students.filter((s) => s.className === className);
    }
    if (status) {
      students = students.filter((s) => s.status === status);
    }
    if (search) {
      const q = String(search).toLowerCase();
      students = students.filter(
        (s) => s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || s.linkCode.toLowerCase().includes(q)
      );
    }
    res.json(students);
  });
  app.post("/api/students", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const data = req.body;
    const newStudent = {
      id: `STU_${Date.now()}`,
      studentId: data.studentId || `2026-${Date.now()}`,
      name: data.name || "New Student",
      className: data.className || "Class 10-A Biology",
      telegramUserId: data.telegramUserId ? Number(data.telegramUserId) : null,
      telegramUsername: data.telegramUsername || null,
      linkCode: `LINK-${Math.floor(1e4 + Math.random() * 9e4)}`,
      status: data.telegramUserId ? "linked" : "unlinked",
      teacherIds: [teacherId]
    };
    await store.saveStudent(newStudent);
    await store.addAuditLog("STUDENT_CREATED", `Added student ${newStudent.name} (${newStudent.studentId})`, teacherId);
    res.json(newStudent);
  });
  app.put("/api/students/:id", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const student = store.getStudentById(req.params.id);
    if (!student || !studentBelongsToTeacher(student, teacherId)) return res.status(404).json({ error: "Student not found" });
    const updated = { ...student, ...req.body, id: student.id, teacherIds: student.teacherIds };
    await store.saveStudent(updated);
    res.json(updated);
  });
  app.delete("/api/students/:id", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const student = store.getStudentById(req.params.id);
    if (!student || !studentBelongsToTeacher(student, teacherId)) return res.status(404).json({ error: "Student not found" });
    const myExamIds = new Set(store.getExams().filter((e) => e.teacherId === teacherId).map((e) => e.id));
    const examIds = [...new Set(store.getAttempts().filter(
      (a) => myExamIds.has(a.examId) && (a.studentId === student.studentId || a.telegramUserId === student.telegramUserId)
    ).map((a) => a.examId))];
    await store.deleteStudent(student.id);
    examIds.forEach((id) => updateExamRanks(id));
    await store.addAuditLog("STUDENT_DELETED", `Removed student ${student.name}`, teacherId);
    res.json({ success: true });
  });
  app.delete("/api/attempts/:id", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const att = store.getAttempts().find((a) => a.id === req.params.id);
    if (!att || !attemptBelongsToTeacher(att, teacherId)) return res.status(404).json({ error: "Attempt not found" });
    await store.deleteAttempt(att.id);
    updateExamRanks(att.examId);
    await store.addAuditLog("ATTEMPT_DELETED", `Removed attempt ${att.id} for ${att.studentName}`, teacherId);
    res.json({ success: true });
  });
  app.get("/api/attempts/:id/detail", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const att = store.getAttempts().find((a) => a.id === req.params.id);
    if (!att || !attemptBelongsToTeacher(att, teacherId)) return res.status(404).json({ error: "Attempt not found" });
    if (!att.answers || Object.keys(att.answers).length === 0) {
      await store.loadAttemptAnswers(att.id);
    }
    const exam = store.getExamById(att.examId);
    const breakdown = (exam?.questions || []).map((q, idx) => {
      const selected = att.answers?.[q.id];
      const has = selected !== void 0 && selected !== null;
      let status = "skipped";
      if (has) {
        status = q.answer !== null && selected === q.answer ? "correct" : "wrong";
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
        explanation: q.explanation || ""
      };
    });
    res.json({ attempt: att, exam: exam ? { id: exam.id, title: exam.title, totalQuestions: exam.totalQuestions } : null, breakdown });
  });
  app.post("/api/students/:id/reset-attempt", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const { examId } = req.body;
    const student = store.getStudentById(req.params.id);
    if (!student || !studentBelongsToTeacher(student, teacherId)) return res.status(404).json({ error: "Student not found" });
    if (examId && !getOwnedExam(String(examId), teacherId)) return res.status(404).json({ error: "Exam not found" });
    const attempts = store.getAttempts(examId).filter(
      (a) => a.studentId === student.studentId || a.telegramUserId === student.telegramUserId
    );
    for (const att of attempts) await store.deleteAttempt(att.id);
    if (examId) updateExamRanks(examId);
    await store.addAuditLog("ATTEMPT_RESET", `Reset attempt for student ${student.name} on exam ${examId || "all"}`, teacherId);
    res.json({ success: true, resetCount: attempts.length });
  });
  app.get("/api/results", (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const { examId, className } = req.query;
    const myExamIds = new Set(store.getExams().filter((e) => e.teacherId === teacherId).map((e) => e.id));
    let attempts = store.getAttempts().filter((a) => myExamIds.has(a.examId));
    if (examId) {
      if (!myExamIds.has(String(examId))) return res.status(404).json({ error: "Exam not found" });
      attempts = attempts.filter((a) => a.examId === examId);
    }
    if (className) {
      attempts = attempts.filter((a) => a.studentClass === className);
    }
    res.json(attempts);
  });
  app.get("/api/results/export", (req, res) => {
    const { examId } = req.query;
    const teacherId = req.teacher?.username;
    const myExamIds = new Set(
      store.getExams().filter((e) => !teacherId || e.teacherId === teacherId).map((e) => e.id)
    );
    let attempts = store.getAttempts().filter((a) => myExamIds.has(a.examId));
    if (examId) {
      if (!myExamIds.has(String(examId))) return res.status(404).json({ error: "Exam not found" });
      attempts = attempts.filter((a) => a.examId === String(examId));
    }
    attempts = attempts.filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED").slice().sort((a, b) => b.score - a.score || a.timeTakenSeconds - b.timeTakenSeconds);
    let csv = "Rank,Student ID,Student Name,Class,Telegram,Status,Score,Max Score,Percentage,Correct,Wrong,Skipped,Time Taken (sec),Submitted At\n";
    attempts.forEach((a, i) => {
      const stu = store.getStudents().find((s) => s.studentId === a.studentId || s.telegramUserId === a.telegramUserId);
      const tg = stu?.telegramUsername || "";
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
        csvCell(a.submittedAt || "")
      ].join(",") + "\n";
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=exam_results_${examId || "all"}.csv`);
    res.send(csv);
  });
  app.get("/api/leaderboard", (req, res) => {
    const { examId } = req.query;
    if (!examId) return res.json([]);
    const exam = store.getExamById(String(examId));
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    const attempts = store.getAttempts(exam.id).filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED");
    attempts.sort((a, b) => (a.rank || 999) - (b.rank || 999));
    res.json({ exam, leaderboard: attempts });
  });
  app.get("/api/settings", (req, res) => {
    const s = store.getSettings();
    res.json({ ...s, telegramBotToken: s.telegramBotToken ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "", botActive: true });
  });
  app.post("/api/message", async (req, res) => {
    const teacherId = req.teacher?.username;
    if (!teacherId) return res.status(401).json({ error: "Unauthorized" });
    const message = clampStr(req.body?.message, env.maxMessageLength);
    const telegramUserId = Number(req.body?.telegramUserId);
    if (!message) return res.status(400).json({ error: "Message required" });
    if (!telegramUserId) return res.status(400).json({ error: "telegramUserId required" });
    const myExamIds = new Set(store.getExams().filter((e) => e.teacherId === teacherId).map((e) => e.id));
    const allowed = store.getAttempts().some((a) => myExamIds.has(a.examId) && Number(a.telegramUserId) === telegramUserId) || store.getStudents().some((s) => Number(s.telegramUserId) === telegramUserId && Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId));
    if (!allowed) return res.status(403).json({ error: "Student not in your class" });
    try {
      await sendTelegramResponse({
        chatId: telegramUserId,
        text: "\u{1F4E2} *Message from teacher*\n\n" + message,
        type: "sendMessage"
      });
      store.addAuditLog("DM", `Teacher ${teacherId} messaged TG ${telegramUserId}`, teacherId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || "Send failed" });
    }
  });
  app.post("/api/broadcast", async (req, res) => {
    const teacherId = requireTeacher(req, res);
    if (!teacherId) return;
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message required" });
    if (message.length > 3500) return res.status(400).json({ error: "Message too long (max 3500)" });
    const myExamIds = new Set(store.getExams().filter((e) => e.teacherId === teacherId).map((e) => e.id));
    const students = store.getStudents().filter((s) => {
      if (Array.isArray(s.teacherIds) && s.teacherIds.includes(teacherId)) return true;
      return store.getAttempts().some((a) => myExamIds.has(a.examId) && a.telegramUserId === s.telegramUserId);
    });
    const unique = [...new Set(students.map((s) => s.telegramUserId).filter(Boolean))];
    const jobId = `BCAST_${Date.now()}`;
    enqueueBroadcast({ id: jobId, teacherId, message, recipients: unique });
    res.json({ ok: true, jobId, queued: unique.length, message: "Broadcast queued \u2014 sending in background" });
  });
  app.put("/api/settings", (req, res) => {
    const body = { ...req.body };
    delete body.telegramBotToken;
    delete body.botUsername;
    delete body.webhookUrl;
    const updated = store.updateSettings(body);
    store.addAuditLog("SETTINGS_UPDATED", "Updated teacher settings");
    res.json(updated);
  });
  app.get("/api/audit-logs", (req, res) => {
    res.json(store.getAuditLogs());
  });
  app.post("/api/seed", (req, res) => {
    if (!env.enableDangerousReseed) {
      return res.status(403).json({ error: "Seed/reset disabled" });
    }
    const fresh = store.resetToSeed();
    store.addAuditLog("SYSTEM_RESEEDED", "Reseeded database to default state");
    res.json(fresh);
  });
  app.post("/api/telegram/simulate", async (req, res) => {
    if (env.isProd) {
      return res.status(403).json({ error: "Simulator disabled in production" });
    }
    try {
      const update = req.body;
      const result = await processTelegramUpdate(update);
      res.json(result || { status: "ignored" });
    } catch (err) {
      console.error("Telegram simulation error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      if (env.telegramWebhookSecret) {
        const hdr = String(req.headers["x-telegram-bot-api-secret-token"] || "");
        if (hdr !== env.telegramWebhookSecret) {
          return res.status(401).json({ error: "Invalid webhook secret" });
        }
      }
      const update = req.body;
      const result = await processTelegramUpdate(update);
      if (result) {
        await sendTelegramResponse(result);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("Telegram webhook error:", err);
      res.status(200).json({ ok: true });
    }
  });
  return app;
}
async function main() {
  assertSecureConfig();
  await initDb();
  await ensureTeachersTable();
  await store.init();
  if (!store.isReady()) {
    throw new Error("Store failed to become ready");
  }
  const PORT = env.port;
  const app = express();
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "quiz-bot-api" });
  });
  app.get("/ready", (_req, res) => {
    if (!store.isReady()) {
      return res.status(503).json({ ok: false, ready: false });
    }
    return res.status(200).json({ ok: true, ready: true, service: "quiz-bot-api" });
  });
  app.get("/", (_req, res) => {
    res.status(200).json({ ok: true, service: "quiz-bot-api", ready: store.isReady() });
  });
  await startServer(app);
  await new Promise((resolve, reject) => {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Quiz Bot API listening on 0.0.0.0:${PORT}`);
      resolve();
    });
    server.on("error", reject);
  });
  startTelegramPolling();
  console.log("Quiz Bot API fully ready");
}
main().catch((err) => {
  console.error("[boot] FATAL:", err);
  process.exit(1);
});
