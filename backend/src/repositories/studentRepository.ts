import { db, withWriteTx } from '../database/client.js';
import type { Student } from '../types/domain.js';

export const studentRepository = {
  async findAll(): Promise<any[]> {
    const res = await db.execute('SELECT * FROM students');
    return res.rows as any[];
  },

  async findTeacherIds(studentId: string): Promise<string[]> {
    const tres = await db.execute({
      sql: 'SELECT teacher_id FROM student_teachers WHERE student_id = ?',
      args: [studentId],
    });
    return (tres.rows as any[]).map((t) => String(t.teacher_id));
  },

  async saveStudent(student: Student): Promise<void> {
    await withWriteTx(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO students (id, student_code, name, class_name, telegram_user_id, telegram_username, link_code, status, joined_at)
              VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, class_name=excluded.class_name,
                telegram_user_id=excluded.telegram_user_id, telegram_username=excluded.telegram_username,
                link_code=excluded.link_code, status=excluded.status, student_code=excluded.student_code`,
        args: [
          student.id, student.studentId, student.name, student.className || null,
          student.telegramUserId ?? null, student.telegramUsername || null,
          student.linkCode || null, student.status || 'ACTIVE',
          student.joinedAt || new Date().toISOString(),
        ],
      });
      await tx.execute({ sql: 'DELETE FROM student_teachers WHERE student_id = ?', args: [student.id] });
      for (const tid of student.teacherIds || []) {
        await tx.execute({
          sql: `INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?,?)`,
          args: [student.id, tid],
        });
      }
    });
  },

  async linkTeacher(studentId: string, teacherId: string): Promise<void> {
    await db.execute({
      sql: `INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?,?)`,
      args: [studentId, teacherId],
    });
  },

  async deleteStudent(id: string): Promise<void> {
    await withWriteTx(async (tx) => {
      await tx.execute({ sql: 'DELETE FROM student_teachers WHERE student_id = ?', args: [id] });
      await tx.execute({ sql: 'DELETE FROM students WHERE id = ?', args: [id] });
    });
  },
};
