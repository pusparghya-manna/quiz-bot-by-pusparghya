import { ensureSchema } from './database/migrateFromBlobs.js';
import { createClient, Client } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

let dbUrl = url || 'file:local.db';
if (dbUrl.startsWith('libsql://')) {
  dbUrl = 'https://' + dbUrl.slice('libsql://'.length);
}

if (isProd && !url) {
  console.error('[db] FATAL: TURSO_DATABASE_URL is required in production');
  process.exit(1);
}

export const db: Client = createClient({
  url: dbUrl,
  authToken: authToken || undefined,
});

/** Ensure Turso is reachable and schema exists. Throws in production on failure. */
export async function initDb(): Promise<void> {
  const maxAttempts = isProd ? 8 : 5;
  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await db.execute('SELECT 1');
      await ensureSchema();
      console.log('[db] Turso connected; schema ready');
      return;
    } catch (err: any) {
      lastErr = err;
      console.error(`[db] init attempt ${i}/${maxAttempts} failed:`, err?.message || err);
      if (i < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * i));
      }
    }
  }
  if (isProd) {
    console.error('[db] FATAL: Could not connect to Turso after retries. Refusing to start.');
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
  console.warn('[db] Turso unavailable — continuing in development only (data may not persist)');
}
