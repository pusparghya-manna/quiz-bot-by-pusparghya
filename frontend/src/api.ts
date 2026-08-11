const API_BASE = import.meta.env.VITE_API_URL || '';

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
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && !path.includes('/auth/login')) clearToken();
  return res;
}
