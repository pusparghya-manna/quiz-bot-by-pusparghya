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

/** JWT secret — production refuses to start without a strong secret */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length >= 24) return secret;
  if (isProd) {
    console.error('[security] FATAL: JWT_SECRET must be set to a long random string (≥24 chars) in production');
    process.exit(1);
  }
  return secret || 'dev-only-jwt-secret-change-me';
}

/**
 * Validate all production-required env vars. Exit with a clear message so Railway
 * marks the deployment unhealthy instead of serving a broken app.
 */
export function assertSecureConfig(): void {
  if (!isProd) return;

  getJwtSecret();

  const missing: string[] = [];
  if (!process.env.TURSO_DATABASE_URL?.trim()) missing.push('TURSO_DATABASE_URL');
  if (!process.env.TURSO_AUTH_TOKEN?.trim()) missing.push('TURSO_AUTH_TOKEN');
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) missing.push('TELEGRAM_BOT_TOKEN');

  if (missing.length) {
    console.error(`[config] FATAL: Missing required production env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const port = Number(process.env.PORT);
  if (process.env.PORT && (!Number.isFinite(port) || port <= 0)) {
    console.error(`[config] FATAL: Invalid PORT="${process.env.PORT}"`);
    process.exit(1);
  }
}

export const env = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  tursoUrl: process.env.TURSO_DATABASE_URL || '',
  tursoToken: process.env.TURSO_AUTH_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    'https://quiz-bot-by-pusparghya.vercel.app,http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  teacherUsername: process.env.TEACHER_USERNAME || '',
  teacherPassword: process.env.TEACHER_PASSWORD || '',
  teacherName: process.env.TEACHER_NAME || '',
  maxOcrBase64Chars: Number(process.env.MAX_OCR_BASE64_CHARS) || 10_000_000,
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH) || 3500,
  enableDangerousReseed: process.env.ENABLE_RESEED === 'true',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  /** Explicit opt-out of long-polling (e.g. when using webhooks only) */
  telegramPollingEnabled: process.env.TELEGRAM_POLLING_ENABLED !== 'false',
};

export function corsOriginDelegate(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean | string) => void
) {
  if (!origin) return cb(null, true);
  if (env.allowedOrigins.includes(origin) || env.allowedOrigins.includes('*')) {
    return cb(null, origin);
  }
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
    return cb(null, origin);
  }
  console.warn('[cors] Blocked origin:', origin);
  return cb(null, false);
}
