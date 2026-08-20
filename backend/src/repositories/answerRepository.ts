import { db, withWriteTx } from '../database/client.js';

export const answerRepository = {
  async findByAttemptId(attemptId: string): Promise<Record<string, number>> {
    const ans = await db.execute({
      sql: 'SELECT question_id, option_index FROM attempt_answers WHERE attempt_id = ?',
      args: [attemptId],
    });
    const answers: Record<string, number> = {};
    for (const a of ans.rows as any[]) {
      answers[String(a.question_id)] = Number(a.option_index);
    }
    return answers;
  },

  /** Idempotent single-answer UPSERT. */
  async upsertAnswer(
    attemptId: string,
    questionId: string,
    optionIndex: number,
    currentQuestionIndex?: number
  ): Promise<void> {
    const now = new Date().toISOString();
    await withWriteTx(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO attempt_answers (attempt_id, question_id, option_index, updated_at)
              VALUES (?,?,?,?)
              ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                option_index=excluded.option_index, updated_at=excluded.updated_at`,
        args: [attemptId, questionId, optionIndex, now],
      });
      if (currentQuestionIndex !== undefined) {
        await tx.execute({
          sql: `UPDATE attempts SET current_question_index = ? WHERE id = ? AND status = 'IN_PROGRESS'`,
          args: [currentQuestionIndex, attemptId],
        });
      }
    });
  },
};
