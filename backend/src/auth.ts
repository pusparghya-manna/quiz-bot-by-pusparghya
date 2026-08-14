import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { getJwtSecret, env } from './config/env.js';
import { isSafeUsername, clampStr } from './middleware/validate.js';

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

    const user = env.teacherUsername.trim();
    const pass = env.teacherPassword;
    if (user && pass) {
      if (!isSafeUsername(user)) {
        console.warn('[auth] TEACHER_USERNAME invalid format, skip seed');
        return;
      }
      const existing = await db.execute({
        sql: 'SELECT username FROM teachers WHERE username = ?',
        args: [user]
      });
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(pass, 12);
        const name = clampStr(env.teacherName || user, 80);
        await db.execute({
          sql: 'INSERT INTO teachers (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
          args: [user, name, hash, new Date().toISOString()]
        });
        console.log('Seeded teacher from environment:', user);
      }
    }
  } catch (e) {
    console.error('ensureTeachersTable failed', e);
  }
}

export async function registerTeacher(username: string, password: string, name: string) {
  const u = clampStr(username, 32);
  if (!isSafeUsername(u)) throw new Error('Username: 3–32 letters, numbers, underscore only');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  if (password.length > 128) throw new Error('Password too long');

  const exists = await db.execute({
    sql: 'SELECT username FROM teachers WHERE username = ?',
    args: [u]
  });
  if (exists.rows.length > 0) throw new Error('Username already taken');

  const hash = await bcrypt.hash(password, 12);
  const display = clampStr(name || u, 80) || u;
  await db.execute({
    sql: 'INSERT INTO teachers (username, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [u, display, hash, new Date().toISOString()]
  });

  const secret = getJwtSecret();
  const token = jwt.sign({ username: u, name: display } as TeacherPayload, secret, { expiresIn: '7d' });
  return { token, teacher: { username: u, name: display } };
}

export async function loginTeacher(username: string, password: string) {
  const u = clampStr(username, 32);
  const res = await db.execute({
    sql: 'SELECT username, name, password_hash FROM teachers WHERE username = ?',
    args: [u]
  });
  // Constant-time-ish: still hash compare only when user exists; dummy compare when not
  if (res.rows.length === 0) {
    await bcrypt.compare(password, '$2a$12$invalidhashinvalidhashinvalidho');
    throw new Error('Invalid username or password');
  }

  const row = res.rows[0] as any;
  const ok = await bcrypt.compare(password, String(row.password_hash));
  if (!ok) throw new Error('Invalid username or password');

  const payload: TeacherPayload = { username: String(row.username), name: String(row.name) };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
  return { token, teacher: { username: payload.username, name: payload.name } };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), getJwtSecret()) as TeacherPayload;
    if (!payload?.username) return res.status(401).json({ error: 'Invalid token' });
    (req as any).teacher = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
