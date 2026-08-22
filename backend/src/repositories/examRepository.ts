import { db, withWriteTx } from '../database/client.js';
import type { Exam, Question } from '../types/domain.js';
import { effectiveExamStatus } from '../examStatus.js';

export const examRepository = {
  async findAll(): Promise<any[]> {
    const res = await db.execute('SELECT * FROM exams ORDER BY created_at DESC');
    return res.rows as any[];
  },

  async findById(id: string): Promise<any | null> {
    const res = await db.execute({ sql: 'SELECT * FROM exams WHERE id = ?', args: [id] });
    return (res.rows[0] as any) || null;
  },

  async findQuestionsByExamIds(examIds: string[]): Promise<any[]> {
    if (examIds.length === 0) return [];
    // Parameterized IN clause
    const placeholders = examIds.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT * FROM questions WHERE exam_id IN (${placeholders}) ORDER BY exam_id, sort_order`,
      args: examIds,
    });
    return res.rows as any[];
  },

  async findQuestionsByExamId(examId: string): Promise<any[]> {
    const res = await db.execute({
      sql: 'SELECT * FROM questions WHERE exam_id = ? ORDER BY sort_order',
      args: [examId],
    });
    return res.rows as any[];
  },

  /** Atomic exam upsert + full question replacement. */
  async saveExamWithQuestions(exam: Exam): Promise<void> {
    const status = effectiveExamStatus(exam);
    const now = new Date().toISOString();
    const questions = exam.questions || [];
    await withWriteTx(async (tx) => {
      await tx.execute({
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
          exam.testNumber || null, questions.length || exam.totalQuestions || 0, exam.startDate,
          exam.durationMinutes || 60, exam.totalMarks || 0, exam.negativeMarking || 0,
          exam.randomizeQuestions ? 1 : 0, exam.randomizeOptions ? 1 : 0,
          exam.resultVisibility || 'PUBLISHED', exam.leaderboardVisibility || 'PUBLISHED', status,
          exam.createdAt || now, now,
        ],
      });
      await tx.execute({ sql: 'DELETE FROM questions WHERE exam_id = ?', args: [exam.id] });
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await tx.execute({
          sql: `INSERT INTO questions (id, exam_id, teacher_id, question, options_json, answer, marks, negative_marks, explanation, subject, sort_order,
                image_file_id, image_mime_type, image_width, image_height)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            q.id, exam.id, exam.teacherId || q.teacherId || 'default', q.question || '',
            JSON.stringify(q.options || []), q.answer ?? null, q.marks ?? 1, q.negativeMarks ?? 0,
            q.explanation || null, q.subject || null, i,
            q.image?.fileId || null, q.image?.mimeType || null,
            q.image?.width ?? null, q.image?.height ?? null,
          ],
        });
      }
    });
  },

  async deleteExamCascade(id: string): Promise<void> {
    await withWriteTx(async (tx) => {
      await tx.execute({
        sql: 'DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = ?)',
        args: [id],
      });
      await tx.execute({ sql: 'DELETE FROM attempts WHERE exam_id = ?', args: [id] });
      await tx.execute({ sql: 'DELETE FROM questions WHERE exam_id = ?', args: [id] });
      await tx.execute({ sql: 'DELETE FROM exams WHERE id = ?', args: [id] });
    });
  },

  async countExams(): Promise<number> {
    const r = await db.execute('SELECT COUNT(*) as c FROM exams');
    return Number((r.rows[0] as any)?.c || 0);
  },
};
