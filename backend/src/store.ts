import { db } from './db.js';
import { Exam, Question, Student, Attempt, AuditLog, SystemSettings } from './types.js';

const TEACHER_ID = 'default';

function generateInitialSettings(): SystemSettings {
  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookUrl: '',
    botUsername: '@quizbotbypusparghya_bot',
    botActive: true,
    autoPublishResults: true,
    systemNotice: 'System ready for exam setup.'
  };
}

class Store {
  private data = {
    exams: [] as Exam[],
    questionBank: [] as Question[],
    students: [] as Student[],
    attempts: [] as Attempt[],
    auditLogs: [] as AuditLog[],
    settings: generateInitialSettings()
  };
  private ready = false;

  async init() {
    try {
      const keys = ['exams', 'questionBank', 'students', 'attempts', 'auditLogs', 'settings'] as const;
      for (const key of keys) {
        const res = await db.execute({
          sql: 'SELECT data FROM app_data WHERE key = ? AND teacher_id = ?',
          args: [key, TEACHER_ID]
        });
        if (res.rows.length > 0) {
          (this.data as any)[key] = JSON.parse(String(res.rows[0].data));
        }
      }
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      }
      this.ready = true;
      console.log('Store loaded from Turso');
    } catch (e) {
      console.error('Store init error, using empty state', e);
      this.ready = true;
    }
  }

  private persist(key: string) {
    const value = (this.data as any)[key];
    db.execute({
      sql: `INSERT INTO app_data (teacher_id, key, data, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(teacher_id, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [TEACHER_ID, key, JSON.stringify(value), new Date().toISOString()]
    }).catch(err => console.error('Persist error', key, err));
  }

  getExams() { return this.data.exams; }
  getExamById(id: string) {
    return this.data.exams.find(e => e.id === id || e.id.toLowerCase() === id.toLowerCase());
  }
  saveExam(exam: Exam) {
    const idx = this.data.exams.findIndex(e => e.id === exam.id);
    if (idx >= 0) this.data.exams[idx] = exam;
    else this.data.exams.unshift(exam);
    this.persist('exams');
    return exam;
  }
  deleteExam(id: string) {
    const len = this.data.exams.length;
    this.data.exams = this.data.exams.filter(e => e.id !== id);
    if (this.data.exams.length !== len) { this.persist('exams'); return true; }
    return false;
  }

  getQuestionBank() { return this.data.questionBank; }
  saveQuestion(q: Question) {
    const idx = this.data.questionBank.findIndex(x => x.id === q.id);
    if (idx >= 0) this.data.questionBank[idx] = q;
    else this.data.questionBank.unshift(q);
    this.persist('questionBank');
    return q;
  }
  saveQuestions(qs: Question[]) {
    for (const q of qs) {
      const idx = this.data.questionBank.findIndex(x => x.id === q.id);
      if (idx >= 0) this.data.questionBank[idx] = q;
      else this.data.questionBank.unshift(q);
    }
    this.persist('questionBank');
    return qs;
  }
  deleteQuestion(id: string) {
    const len = this.data.questionBank.length;
    this.data.questionBank = this.data.questionBank.filter(q => q.id !== id);
    if (this.data.questionBank.length !== len) { this.persist('questionBank'); return true; }
    return false;
  }

  getStudents() { return this.data.students; }
  saveStudent(s: Student) {
    const idx = this.data.students.findIndex(x => x.id === s.id);
    if (idx >= 0) this.data.students[idx] = s;
    else this.data.students.unshift(s);
    this.persist('students');
    return s;
  }
  getStudentById(id: string) {
    return this.data.students.find(s => s.id === id || s.studentId === id);
  }
  deleteStudent(id: string) {
    const stu = this.getStudentById(id);
    if (!stu) return false;
    this.data.students = this.data.students.filter(s => s.id !== stu.id);
    // remove all attempts by this student
    const before = this.data.attempts.length;
    this.data.attempts = this.data.attempts.filter(a =>
      a.studentId !== stu.studentId && a.telegramUserId !== stu.telegramUserId
    );
    this.persist('students');
    if (this.data.attempts.length !== before) this.persist('attempts');
    return true;
  }
  deleteAttemptById(id: string) {
    const len = this.data.attempts.length;
    this.data.attempts = this.data.attempts.filter(a => a.id !== id);
    if (this.data.attempts.length !== len) { this.persist('attempts'); return true; }
    return false;
  }
  getStudentByTelegramId(id: number) {
    return this.data.students.find(s => s.telegramUserId === id);
  }
  getStudentByLinkCode(code: string) {
    return this.data.students.find(s => s.linkCode === code);
  }

  getAttempts(examId?: string) {
    if (examId) return this.data.attempts.filter(a => a.examId === examId || a.examId.toLowerCase() === examId.toLowerCase());
    return this.data.attempts;
  }
  getAttempt(examId: string, telegramUserId: number | string) {
    const numId = Number(telegramUserId);
    const strId = String(telegramUserId);
    const mine = this.getAttempts(examId).filter(a =>
      a.telegramUserId === numId || String(a.telegramUserId) === strId || a.studentId === strId
    );
    if (!mine.length) return undefined;
    const active = mine.find(a => a.status === 'IN_PROGRESS');
    if (active) return active;
    // newest first (attempts are unshifted on save)
    return mine[0];
  }
  getStudentAttempts(examId: string, telegramUserId: number | string) {
    const numId = Number(telegramUserId);
    const strId = String(telegramUserId);
    return this.getAttempts(examId).filter(a =>
      a.telegramUserId === numId || String(a.telegramUserId) === strId || a.studentId === strId
    );
  }
  hasOfficialAttempt(examId: string, telegramUserId: number | string) {
    return this.getStudentAttempts(examId, telegramUserId).some(a => a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED' || a.status === 'IN_PROGRESS'));
  }
  saveAttempt(a: Attempt) {
    const idx = this.data.attempts.findIndex(x => x.id === a.id);
    if (idx >= 0) this.data.attempts[idx] = a;
    else this.data.attempts.unshift(a);
    this.persist('attempts');
    return a;
  }
  deleteAttempt(id: string) {
    const len = this.data.attempts.length;
    this.data.attempts = this.data.attempts.filter(a => a.id !== id);
    if (this.data.attempts.length !== len) { this.persist('attempts'); return true; }
    return false;
  }

  addAuditLog(action: string, details: string, actor = 'Teacher Admin') {
    const log: AuditLog = {
      id: `LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action, details, actor
    };
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    this.persist('auditLogs');
    return log;
  }
  getAuditLogs() { return this.data.auditLogs; }

  getSettings() {
    if (process.env.TELEGRAM_BOT_TOKEN && !this.data.settings.telegramBotToken) {
      this.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    }
    return this.data.settings;
  }
  updateSettings(updates: Partial<SystemSettings>) {
    this.data.settings = { ...this.data.settings, ...updates };
    this.persist('settings');
    return this.data.settings;
  }

  resetToSeed() {
    this.data = {
      exams: [],
      questionBank: [],
      students: [],
      attempts: [],
      auditLogs: [{
        id: 'LOG_INIT',
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_INITIALIZED',
        details: 'System initialized in clean state.',
        actor: 'System'
      }],
      settings: generateInitialSettings()
    };
    for (const k of Object.keys(this.data)) this.persist(k);
    return this.data;
  }
}

export const store = new Store();
