import { createClient, Client } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.warn('TURSO_DATABASE_URL missing');
}

export const db: Client = createClient({
  url: url || 'file:local.db',
  authToken: authToken || undefined,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_data (
      teacher_id TEXT NOT NULL,
      key TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (teacher_id, key)
    )
  `);
  console.log('Turso app_data table ready');
}
