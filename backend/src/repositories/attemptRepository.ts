import { db, withWriteTx } from '../database/client.js';
import type { Attempt } from '../types/domain.js';

export const attemptRepository = {
  async findRecent(limit = 2000): Promise<any[]> {
    const res = await db.execute({
      sql: `SELECT * FROM attempts ORDER BY started_at DESC LIMIT ?`,
      args: [limit],
    });
    return res.rows as any[];
  },

  async findByExam(examId: string): Promise<any[]> {
    const res = await db.execute({
      sql: 'SELECT * FROM attempts WHERE exam_id = ? ORDER BY started_at DESC',
      args: [examId],
    });
    return res.rows as any[];
  },

  async nextAttemptNumber(examId: string, telegramUserId: number): Promise<number> {
    const res = await db.execute({
      sql: `SELECT COALESCE(MAX(attempt_number), 0) as m FROM attempts WHERE exam_id = ? AND telegram_user_id = ?`,
      args: [examId, telegramUserId],
    });
    return Number((res.rows[0] as any)?.m || 0) + 1;
  },

  async upsertAttempt(attempt: Attempt, replaceAnswers = true): Promise<void> {
    await withWriteTx(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO attempts (
                id, exam_id, student_id, telegram_user_id, student_name, student_class,
                started_at, expires_at, submitted_at, status, current_question_index,
                score, max_score, percentage, correct_count, wrong_count, skipped_count,
                time_taken_seconds, rank, is_official, attempt_number
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                student_id=excluded.student_id, student_name=excluded.student_name,
                student_class=excluded.student_class, expires_at=excluded.expires_at,
                submitted_at=excluded.submitted_at, status=excluded.status,
                current_question_index=excluded.current_question_index,
                score=excluded.score, max_score=excluded.max_score, percentage=excluded.percentage,
                correct_count=excluded.correct_count, wrong_count=excluded.wrong_count,
                skipped_count=excluded.skipped_count, time_taken_seconds=excluded.time_taken_seconds,
                rank=excluded.rank, is_official=excluded.is_official, attempt_number=excluded.attempt_number`,
        args: [
          attempt.id, attempt.examId, attempt.studentId || null, attempt.telegramUserId,
          attempt.studentName || null, attempt.studentClass || null, attempt.startedAt, attempt.expiresAt,
          attempt.submittedAt || null, attempt.status, attempt.currentQuestionIndex || 0,
          attempt.score || 0, attempt.maxScore || 0, attempt.percentage || 0,
          attempt.correctCount || 0, attempt.wrongCount || 0, attempt.skippedCount || 0,
          attempt.timeTakenSeconds || 0, attempt.rank ?? null,
          attempt.isOfficial === false ? 0 : 1, attempt.attemptNumber || 1,
        ],
      });
      if (replaceAnswers && attempt.answers) {
        await tx.execute({ sql: 'DELETE FROM attempt_answers WHERE attempt_id = ?', args: [attempt.id] });
        for (const [qid, opt] of Object.entries(attempt.answers)) {
          await tx.execute({
            sql: `INSERT INTO attempt_answers (attempt_id, question_id, option_index, updated_at) VALUES (?,?,?,?)`,
            args: [attempt.id, qid, opt, new Date().toISOString()],
          });
        }
      }
    });
  },

  /** Conditional submit — returns whether a row transitioned from IN_PROGRESS. */
  async submitIfInProgress(attempt: Attempt): Promise<boolean> {
    return withWriteTx(async (tx) => {
      const upd = await tx.execute({
        sql: `UPDATE attempts SET
                status = ?, submitted_at = ?, score = ?, max_score = ?, percentage = ?,
                correct_count = ?, wrong_count = ?, skipped_count = ?, time_taken_seconds = ?,
                rank = ?, is_official = ?, attempt_number = ?
              WHERE id = ? AND status = 'IN_PROGRESS'`,
        args: [
          attempt.status, attempt.submittedAt || new Date().toISOString(),
          attempt.score || 0, attempt.maxScore || 0, attempt.percentage || 0,
          attempt.correctCount || 0, attempt.wrongCount || 0, attempt.skippedCount || 0,
          attempt.timeTakenSeconds || 0, attempt.rank ?? null,
          attempt.isOfficial === false ? 0 : 1, attempt.attemptNumber || 1, attempt.id,
        ],
      });
      const affected = typeof (upd as any).rowsAffected === 'number' ? (upd as any).rowsAffected : -1;
      if (affected === 0) return false;
      if (attempt.answers) {
        for (const [qid, opt] of Object.entries(attempt.answers)) {
          await tx.execute({
            sql: `INSERT INTO attempt_answers (attempt_id, question_id, option_index, updated_at)
                  VALUES (?,?,?,?)
                  ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                    option_index=excluded.option_index, updated_at=excluded.updated_at`,
            args: [attempt.id, qid, opt, new Date().toISOString()],
          });
        }
      }
      return true;
    });
  },

  async updateRank(id: string, rank: number | null): Promise<void> {
    await db.execute({
      sql: 'UPDATE attempts SET rank = ? WHERE id = ?',
      args: [rank, id],
    });
  },

  async deleteById(id: string): Promise<void> {
    await withWriteTx(async (tx) => {
      await tx.execute({ sql: 'DELETE FROM attempt_answers WHERE attempt_id = ?', args: [id] });
      await tx.execute({ sql: 'DELETE FROM attempts WHERE id = ?', args: [id] });
    });
  },
};
