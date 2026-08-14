/**
 * Same-origin `/api` so Vercel rewrites proxy to Railway.
 * Auth uses httpOnly cookie (`quiz_session`) set by the backend.
 * credentials: 'include' is required for cookie sessions.
 */
const API_BASE = '';

/** @deprecated Prefer cookie session; kept only for transitional UI state (logged-in flag). */
export const getToken = () => {
  try {
    return sessionStorage.getItem('quiz_authed') || '';
  } catch {
    return '';
  }
};

export const setToken = (_t: string) => {
  try {
    sessionStorage.setItem('quiz_authed', '1');
  } catch {
    /* ignore */
  }
};

export const clearToken = () => {
  try {
    sessionStorage.removeItem('quiz_authed');
    localStorage.removeItem('quiz_token'); // migrate away from legacy storage
  } catch {
    /* ignore */
  }
};

export async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as any || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

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
    /* ignore network errors on logout */
  }
  clearToken();
}
