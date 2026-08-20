import { store } from '../store.js';
import { processTelegramUpdate, sendTelegramResponse } from './bot.js';

let isPollingRunning = false;

export function startTelegramPolling() {
  if (isPollingRunning) {
    console.warn('[Telegram Bot Engine] Polling already running — skip duplicate worker');
    return;
  }
  if (process.env.TELEGRAM_POLLING_ENABLED === 'false') {
    console.log('[Telegram Bot Engine] TELEGRAM_POLLING_ENABLED=false — polling disabled');
    return;
  }
  isPollingRunning = true;

  console.log('[Telegram Bot Engine] Starting live Telegram long polling service...');

  let offset = 0;
  // Serialize processing lightly: one update at a time is safer for shared cache,
  // but we answer callbacks immediately and keep long-poll timeout short.
  let processing = Promise.resolve();

  const pollLoop = async () => {
    while (true) {
      const settings = store.getSettings();
      const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken;

      if (!token || settings.botActive === false) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      try {
        // timeout=25 is fine for Telegram long poll; network errors retry fast
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query']))}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(35000) });

        if (!res.ok) {
          const errData: any = await res.json().catch(() => ({}));
          if (errData.error_code === 409) {
            console.log('[Telegram Bot Engine] Webhook conflict — deleting webhook for polling…');
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          console.warn('[Telegram Bot Engine] Polling warning:', errData.description || res.statusText);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
          for (const update of data.result) {
            offset = update.update_id + 1;

            // Answer callback immediately so Telegram UI stops spinning
            if (update.callback_query?.id) {
              fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: update.callback_query.id }),
              }).catch(() => {});
            }

            // Chain processing so order is preserved but poll loop can continue fetching
            processing = processing
              .then(async () => {
                try {
                  const response = await processTelegramUpdate(update);
                  if (response) {
                    await sendTelegramResponse(response);
                  }
                } catch (procErr: any) {
                  console.error('[Telegram Bot Engine] Error processing update:', procErr?.message || procErr);
                }
              })
              .catch(() => {});
          }
          // Wait for current batch to finish before next getUpdates to avoid backlog races
          await processing;
        }
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.error('[Telegram Bot Engine] Polling fetch error:', err?.message || err);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  };

  pollLoop();
}
