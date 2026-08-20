import { ensureSchema } from './migrateFromBlobs.js';
import { createClient, Client, InArgs, Transaction } from '@libsql/client';
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

export type SqlStmt = { sql: string; args?: InArgs };

/** Run multiple statements atomically. Rolls back on any failure. */
export async function withWriteTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await db.transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  }
}

/** Convenience: batch of statements in one write transaction. */
export async function batchWrite(stmts: SqlStmt[]): Promise<void> {
  if (stmts.length === 0) return;
  await withWriteTx(async (tx) => {
    for (const s of stmts) {
      await tx.execute({ sql: s.sql, args: s.args ?? [] });
    }
  });
}

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
      const msg = err?.message || String(err);
      // Never log tokens/credentials
      console.error(`[db] init attempt ${i}/${maxAttempts} failed:`, msg.replace(/eyJ[A-Za-z0-9_-]+/g, '[redacted]'));
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
