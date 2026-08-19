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

  const pollLoop = async () => {
    while (true) {
      const settings = store.getSettings();
      const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken;

      if (!token || !settings.botActive) {
        // Wait 3s if token is missing or bot is disabled
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`;
        const res = await fetch(url);

        if (!res.ok) {
          const errData: any = await res.json().catch(() => ({}));
          if (errData.error_code === 409) {
            console.log('[Telegram Bot Engine] Webhook conflict detected. Deleting webhook to switch to polling...');
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          } else {
            console.warn('[Telegram Bot Engine] Polling warning:', errData.description || res.statusText);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }
        }

        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;

            // Stop Telegram client button loading spinner instantly
            if (update.callback_query?.id) {
              fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: update.callback_query.id })
              }).catch(() => {});
            }

            try {
              const response = await processTelegramUpdate(update);
              if (response) {
                await sendTelegramResponse(response);
              }
            } catch (procErr) {
              console.error('[Telegram Bot Engine] Error processing update:', procErr);
            }
          }
        }
      } catch (err: any) {
        console.error('[Telegram Bot Engine] Polling fetch error:', err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };

  pollLoop();
}
