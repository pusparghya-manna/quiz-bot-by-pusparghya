import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'quiz-bot-tinkori-secret-2026';

export interface TeacherPayload {
  username: string;
  name: string;
}

export async function ensureTeachersTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS teachers (
        username TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    // Seed default teacher if empty
    const existing = await db.execute({
      sql: 'SELECT username FROM teachers WHERE username = ?',
      args: [process.env.TEACHER_USERNAME || 'TinkoriSir']
    });
    if (existing.rows.length === 0) {
      const user = process.env.TEACHER_USERNAME || 'TinkoriSir';
      const pass = process.env.TEACHER_PASSWORD || 'OnlineQuiz@123';
      const hash = await bcrypt.hash(pass, 10);
      await db.execute({
        sql: 'INSERT INTO teachers (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
        args: [user, 'Tinkori Sir', hash, new Date().toISOString()]
      });
      console.log('Seeded default teacher:', user);
    }
  } catch (e) {
    console.error('ensureTeachersTable failed', e);
  }
}

export async function registerTeacher(username: string, password: string, name: string) {
  const u = username.trim();
  if (u.length < 3) throw new Error('Username must be at least 3 characters');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  if (!/^[a-zA-Z0-9_]+$/.test(u)) throw new Error('Username: letters, numbers, underscore only');

  const exists = await db.execute({
    sql: 'SELECT username FROM teachers WHERE username = ?',
    args: [u]
  });
  if (exists.rows.length > 0) throw new Error('Username already taken');

  const hash = await bcrypt.hash(password, 10);
  const display = (name || u).trim();
  await db.execute({
    sql: 'INSERT INTO teachers (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [u, display, hash, new Date().toISOString()]
  });

  const token = jwt.sign({ username: u, name: display } as TeacherPayload, JWT_SECRET, { expiresIn: '7d' });
  return { token, teacher: { username: u, name: display } };
}

export async function loginTeacher(username: string, password: string) {
  const res = await db.execute({
    sql: 'SELECT username, name, password_hash FROM teachers WHERE username = ?',
    args: [username.trim()]
  });
  if (res.rows.length === 0) throw new Error('Invalid username or password');

  const row = res.rows[0] as any;
  const ok = await bcrypt.compare(password, String(row.password_hash));
  if (!ok) throw new Error('Invalid username or password');

  const payload: TeacherPayload = { username: String(row.username), name: String(row.name) };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  return { token, teacher: { username: payload.username, name: payload.name } };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as TeacherPayload;
    (req as any).teacher = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
