/**
 * Always use same-origin `/api` in the browser so Vercel rewrites
 * proxy to Railway. Avoids "Failed to fetch" on Wi‑Fi that blocks railway.app.
 * Local dev: vite proxy still forwards /api → localhost:3000.
 */
const API_BASE = '';

export const getToken = () => localStorage.getItem('quiz_token') || '';
export const setToken = (t: string) => localStorage.setItem('quiz_token', t);
export const clearToken = () => localStorage.removeItem('quiz_token');

export async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as any || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    const res = await fetch(url, { ...options, headers });
    if (
      res.status === 401 &&
      !path.includes('/auth/login') &&
      !path.includes('/auth/register')
    ) {
      clearToken();
    }
    return res;
  } catch (err: any) {
    const msg =
      err?.message === 'Failed to fetch'
        ? 'Cannot reach server on this network. Try mobile data or another Wi‑Fi.'
        : err?.message || 'Network error';
    throw new Error(msg);
  }
}
