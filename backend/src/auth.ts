import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { db } from './db.js';
import { getJwtSecret, env } from './config/env.js';
import { isSafeUsername, clampStr } from './middleware/validate.js';

export interface TeacherPayload {
  username: string;
  name: string;
  email?: string;
  firebaseUid?: string;
  emailVerified?: boolean;
}

const FIREBASE_SENTINEL = 'firebase-managed';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function firebaseAdminAuth(): Auth {
  if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
    throw new Error('Firebase Authentication is not configured on the backend');
  }
  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey.replace(/\\n/g, '\n'),
    }),
  });
  return getAuth(app);
}

async function ensureTeacherAuthColumns() {
  const additions = [
    ['email', 'ALTER TABLE teachers ADD COLUMN email TEXT'],
    ['firebase_uid', 'ALTER TABLE teachers ADD COLUMN firebase_uid TEXT'],
    ['email_verified', "ALTER TABLE teachers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0"],
    ['auth_provider', "ALTER TABLE teachers ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'legacy'"],
  ] as const;
  const info = await db.execute('PRAGMA table_info(teachers)');
  const columns = new Set((info.rows as any[]).map((r) => String(r.name)));
  for (const [column, ddl] of additions) {
    if (!columns.has(column)) {
      await db.execute(ddl);
      console.log(`[auth] added teachers.${column}`);
    }
  }
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_email_unique ON teachers(email) WHERE email IS NOT NULL AND email != \'\'');
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_firebase_uid_unique ON teachers(firebase_uid) WHERE firebase_uid IS NOT NULL AND firebase_uid != \'\'');
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
    await ensureTeacherAuthColumns();

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
          sql: 'INSERT INTO teachers (username, name, password_hash, created_at, auth_provider) VALUES (?, ?, ?, ?, ?)',
          args: [user, name, hash, new Date().toISOString(), 'legacy']
        });
        console.log('Seeded teacher from environment:', user);
      }
    }
  } catch (e) {
    console.error('ensureTeachersTable failed', e);
  }
}

function issueTeacherToken(teacher: TeacherPayload) {
  return jwt.sign(teacher, getJwtSecret(), { expiresIn: '7d' });
}

function mapTeacher(row: any): TeacherPayload {
  return {
    username: String(row.username),
    name: String(row.name),
    email: normalizeEmail(row.email) || undefined,
    firebaseUid: row.firebase_uid ? String(row.firebase_uid) : undefined,
    emailVerified: !!row.email_verified,
  };
}

export async function registerTeacher(username: string, password: string, name: string, email?: string) {
  const u = clampStr(username, 32);
  const normalizedEmail = normalizeEmail(email);
  if (!isSafeUsername(u)) throw new Error('Username: 3–32 letters, numbers, underscore only');
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('A valid email is required');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  if (password.length > 128) throw new Error('Password too long');

  const exists = await db.execute({ sql: 'SELECT username FROM teachers WHERE username = ? OR lower(email) = ?', args: [u, normalizedEmail] });
  if (exists.rows.length > 0) throw new Error('Username or email already registered');

  const hash = await bcrypt.hash(password, 12);
  const display = clampStr(name || u, 80) || u;
  await db.execute({
    sql: 'INSERT INTO teachers (username, name, password_hash, email, email_verified, auth_provider, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    args: [u, display, hash, normalizedEmail, 'legacy', new Date().toISOString()]
  });

  const teacher: TeacherPayload = { username: u, name: display, email: normalizedEmail, emailVerified: false };
  return { token: issueTeacherToken(teacher), teacher };
}

async function firebasePasswordSignIn(email: string, password: string) {
  if (!env.firebaseWebApiKey) throw new Error('Firebase web API key is not configured on the backend');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.firebaseWebApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.idToken) throw new Error('Invalid username or password');
  return String(data.idToken);
}

export async function syncFirebaseTeacher(idToken: string, requestedUsername?: string, requestedName?: string) {
  const decoded = await firebaseAdminAuth().verifyIdToken(idToken);
  const email = normalizeEmail(decoded.email);
  if (!email) throw new Error('Firebase account has no email address');

  const byUid = await db.execute({ sql: 'SELECT * FROM teachers WHERE firebase_uid = ?', args: [decoded.uid] });
  const byEmail = await db.execute({ sql: 'SELECT * FROM teachers WHERE lower(email) = ?', args: [email] });
  const existing = (byUid.rows[0] || byEmail.rows[0]) as any;

  if (existing) {
    if (existing.firebase_uid && String(existing.firebase_uid) !== String(decoded.uid)) {
      throw new Error('This email is already linked to another account');
    }
    const provider = existing.password_hash === FIREBASE_SENTINEL ? 'firebase' : 'legacy+firebase';
    await db.execute({
      sql: 'UPDATE teachers SET email = ?, firebase_uid = ?, email_verified = ?, auth_provider = ? WHERE username = ?',
      args: [email, decoded.uid, decoded.email_verified ? 1 : 0, provider, existing.username],
    });
    const teacher = mapTeacher({ ...existing, email, firebase_uid: decoded.uid, email_verified: decoded.email_verified ? 1 : 0 });
    return { token: issueTeacherToken(teacher), teacher };
  }

  let username = clampStr(requestedUsername || '', 32);
  if (!isSafeUsername(username)) {
    username = clampStr(email.split('@')[0].replace(/[^A-Za-z0-9_]/g, '_'), 32);
  }
  if (!isSafeUsername(username)) throw new Error('Choose a valid username to finish account setup');
  const base = username;
  let suffix = 1;
  while ((await db.execute({ sql: 'SELECT username FROM teachers WHERE username = ?', args: [username] })).rows.length) {
    suffix += 1;
    username = `${base.slice(0, 32 - String(suffix).length - 1)}_${suffix}`;
  }
  const name = clampStr(requestedName || String(decoded.name || username), 80) || username;
  await db.execute({
    sql: 'INSERT INTO teachers (username, name, password_hash, email, firebase_uid, email_verified, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [username, name, FIREBASE_SENTINEL, email, decoded.uid, decoded.email_verified ? 1 : 0, 'firebase', new Date().toISOString()],
  });
  const teacher: TeacherPayload = { username, name, email, firebaseUid: decoded.uid, emailVerified: !!decoded.email_verified };
  return { token: issueTeacherToken(teacher), teacher };
}

export async function loginTeacher(usernameOrEmail: string, password: string) {
  const identifier = clampStr(usernameOrEmail, 254);
  const normalizedEmail = normalizeEmail(identifier);
  const res = await db.execute({
    sql: 'SELECT * FROM teachers WHERE username = ? OR lower(email) = ? LIMIT 1',
    args: [identifier, normalizedEmail],
  });
  if (res.rows.length === 0) {
    await bcrypt.compare(password, '$2a$12$invalidhashinvalidhashinvalidho');
    throw new Error('Invalid username or password');
  }

  let row = res.rows[0] as any;
  if (row.password_hash === FIREBASE_SENTINEL || (row.firebase_uid && normalizedEmail && normalizedEmail === normalizeEmail(row.email))) {
    const email = normalizeEmail(row.email);
    if (!email) throw new Error('Add an email to this account before using password login');
    const firebaseToken = await firebasePasswordSignIn(email, password);
    return syncFirebaseTeacher(firebaseToken, String(row.username), String(row.name));
  }

  const ok = await bcrypt.compare(password, String(row.password_hash));
  if (!ok) throw new Error('Invalid username or password');
  const teacher = mapTeacher(row);
  return { token: issueTeacherToken(teacher), teacher };
}

export function setSessionCookie(res: Response, token: string) {
  const cookieName = env.isProd ? '__Host-quiz_session' : 'quiz_session';
  const secure = env.isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}

export function clearSessionCookie(res: Response) {
  const cookieName = env.isProd ? '__Host-quiz_session' : 'quiz_session';
  const secure = env.isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  let raw: string | undefined;
  if (header && header.startsWith('Bearer ')) raw = header.slice(7);
  if (!raw && typeof req.query?.token === 'string' && req.query.token) raw = req.query.token;
  if (!raw && typeof req.headers.cookie === 'string') {
    const cookieName = env.isProd ? '__Host-quiz_session' : 'quiz_session';
    const cookie = req.headers.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
    if (cookie) raw = decodeURIComponent(cookie.slice(cookieName.length + 1));
  }
  if (!raw) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(raw, getJwtSecret()) as TeacherPayload;
    if (!payload?.username) return res.status(401).json({ error: 'Invalid token' });
    (req as any).teacher = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function teacherFromRequest(req: Request): TeacherPayload {
  return (req as any).teacher as TeacherPayload;
}

export function getFirebaseClientConfigStatus() {
  return { configured: !!(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey && env.firebaseWebApiKey) };
}

export async function sendFirebasePasswordReset(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const row = await db.execute({ sql: 'SELECT username FROM teachers WHERE lower(email) = ?', args: [normalizedEmail] });
  if (row.rows.length === 0) return;
  if (!env.firebaseWebApiKey) throw new Error('Firebase web API key is not configured on the backend');
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.firebaseWebApiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: normalizedEmail }),
  });
}
