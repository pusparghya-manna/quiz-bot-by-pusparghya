/**
 * Same-origin `/api` — Vercel rewrites proxy to Railway.
 * Primary auth: Bearer JWT in sessionStorage (works through the proxy).
 * Optional: httpOnly cookie when the backend sets one (credentials: include).
 */
const API_BASE = '';
const TOKEN_KEY = 'quiz_token';
const AUTH_FLAG = 'quiz_authed';

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setToken = (t: string) => {
  try {
    if (t && t !== '1') {
      sessionStorage.setItem(TOKEN_KEY, t);
    }
    sessionStorage.setItem(AUTH_FLAG, '1');
    // clear legacy localStorage copy
    localStorage.removeItem('quiz_token');
  } catch {
    /* ignore */
  }
};

export const clearToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(AUTH_FLAG);
    localStorage.removeItem('quiz_token');
  } catch {
    /* ignore */
  }
};

export async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as any || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
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

export async function logoutApi() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  clearToken();
}
