/**
 * Show interim "please wait" feedback on Telegram while slow work runs.
 * Fire-and-forget — never blocks or throws to callers.
 */

const FRAMES = ['⏳', '⌛️', '⏳', '🔄'];

export function loadingText(kind: 'submit' | 'start' | 'generic' | 'results' | 'leaderboard'): string {
  switch (kind) {
    case 'submit':
      return `${FRAMES[0]} *Submitting exam…*\n\nPlease wait while we score your answers.\nThis may take a few seconds for large exams.`;
    case 'start':
      return `${FRAMES[0]} *Starting exam…*\n\nPreparing your questions. Please wait.`;
    case 'results':
      return `${FRAMES[0]} *Loading results…*\n\nPlease wait.`;
    case 'leaderboard':
      return `${FRAMES[0]} *Loading leaderboard…*\n\nPlease wait.`;
    default:
      return `${FRAMES[0]} *Please wait…*\n\nWorking on your request.`;
  }
}

export function classifySlowCallback(data: string): 'submit' | 'start' | 'results' | 'leaderboard' | 'generic' | null {
  if (!data) return null;
  if (data.startsWith('do_submit_')) return 'submit';
  if (data.startsWith('start_exam_') || data.startsWith('resume_exam_') || data.startsWith('reattempt_')) return 'start';
  // Review answers may hit Turso for answer rows — show brief loading
  if (data.startsWith('rev_')) return 'results';
  // List endpoints are usually fast — no loading overlay (avoids race/stuck UI)
  if (data === 'btn_results' || data === 'btn_leaderboard' || data === 'leaderboard_more') return null;
  if (data.startsWith('grid_')) return 'generic';
  return null;
}

export async function sendLoadingEdit(opts: {
  token: string;
  chatId: number;
  messageId?: number;
  kind: 'submit' | 'start' | 'results' | 'leaderboard' | 'generic';
}): Promise<void> {
  const { token, chatId, messageId, kind } = opts;
  if (!token || !chatId) return;
  const text = loadingText(kind);
  try {
    if (messageId) {
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: 'Markdown',
        }),
        signal: AbortSignal.timeout(5000),
      });
    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch {
    /* ignore — best-effort UX only */
  }
}

export async function answerCallbackLoading(
  token: string,
  callbackQueryId: string,
  kind: 'submit' | 'start' | 'results' | 'leaderboard' | 'generic'
): Promise<void> {
  const text =
    kind === 'submit'
      ? 'Submitting exam…'
      : kind === 'start'
        ? 'Starting exam…'
        : kind === 'results'
          ? 'Loading results…'
          : kind === 'leaderboard'
            ? 'Loading leaderboard…'
            : 'Please wait…';
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* ignore */
  }
}
