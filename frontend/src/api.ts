const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

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
    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
      clearToken();
    }
    return res;
  } catch (err: any) {
    // Re-throw with clearer message for UI
    const msg = err?.message === 'Failed to fetch'
      ? 'Cannot reach server. Check your internet or try again.'
      : (err?.message || 'Network error');
    throw new Error(msg);
  }
}
