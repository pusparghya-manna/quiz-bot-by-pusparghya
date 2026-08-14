import dotenv from 'dotenv';
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) {
    console.warn(`[config] Missing ${name}`);
  }
  return v || '';
}

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

/** JWT secret — weak default only allowed outside production */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length >= 24) return secret;
  if (isProd) {
    console.error('[security] JWT_SECRET must be set to a long random string in production');
    // Still run but use a process-unique secret so tokens don't work across restarts with empty env
    return `unsafe-prod-${process.pid}-${Date.now()}`;
  }
  return secret || 'dev-only-jwt-secret-change-me';
}

export const env = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  tursoUrl: process.env.TURSO_DATABASE_URL || '',
  tursoToken: process.env.TURSO_AUTH_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  /** Comma-separated allowed CORS origins; empty = reflect request origin only if in list fails open to vercel+localhost */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    'https://quiz-bot-by-pusparghya.vercel.app,http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  teacherUsername: process.env.TEACHER_USERNAME || '',
  teacherPassword: process.env.TEACHER_PASSWORD || '',
  teacherName: process.env.TEACHER_NAME || '',
  /** Max base64 OCR payload (~7.5MB decoded at 10mb string) */
  maxOcrBase64Chars: Number(process.env.MAX_OCR_BASE64_CHARS) || 10_000_000,
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH) || 3500,
  enableDangerousReseed: process.env.ENABLE_RESEED === 'true',
};

export function corsOriginDelegate(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean | string) => void
) {
  if (!origin) return cb(null, true); // same-origin / curl
  if (env.allowedOrigins.includes(origin) || env.allowedOrigins.includes('*')) {
    return cb(null, origin);
  }
  // Allow any *.vercel.app preview
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
    return cb(null, origin);
  }
  console.warn('[cors] Blocked origin:', origin);
  return cb(null, false);
}
