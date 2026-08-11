import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'quiz-bot-tinkori-secret-2026';
const TEACHER_USERNAME = process.env.TEACHER_USERNAME || 'TinkoriSir';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'OnlineQuiz@123';

export interface TeacherPayload {
  username: string;
  name: string;
}

export function loginTeacher(username: string, password: string) {
  if (username !== TEACHER_USERNAME || password !== TEACHER_PASSWORD) {
    throw new Error('Invalid username or password');
  }
  const token = jwt.sign(
    { username: TEACHER_USERNAME, name: 'Tinkori Sir' } as TeacherPayload,
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return {
    token,
    teacher: { username: TEACHER_USERNAME, name: 'Tinkori Sir' }
  };
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
