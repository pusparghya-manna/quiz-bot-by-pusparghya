import { db } from '../database/client.js';

export const telegramUpdateRepository = {
  /** Returns true if this update_id was newly claimed. */
  async claim(updateId: number): Promise<boolean> {
    try {
      await db.execute({
        sql: `INSERT INTO telegram_processed_updates (update_id, processed_at) VALUES (?,?)`,
        args: [updateId, new Date().toISOString()],
      });
      return true;
    } catch {
      return false;
    }
  },
};
