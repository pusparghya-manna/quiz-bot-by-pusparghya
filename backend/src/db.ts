import { ensureSchema } from './database/migrateFromBlobs.js';
import { createClient, Client } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.warn('TURSO_DATABASE_URL missing');
}

let dbUrl = url || 'file:local.db';
// Turso HTTP API prefers https:// over libsql://
if (dbUrl.startsWith('libsql://')) {
  dbUrl = 'https://' + dbUrl.slice('libsql://'.length);
}

export const db: Client = createClient({
  url: dbUrl,
  authToken: authToken || undefined,
});

export async function initDb() {
  // Schema is also ensured in store.init via ensureSchema()
  const maxAttempts = 5;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await ensureSchema();
      console.log("Turso schema ready (normalized + app_data)");
      return;
    } catch (err: any) {
      console.error(`Turso init attempt ${i}/${maxAttempts} failed:`, err?.message || err);
      if (i === maxAttempts) {
        console.error("Turso unavailable after retries – continuing with in-memory only (data will not persist)");
        return;
      }
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}
