const API_BASE = import.meta.env.VITE_API_URL || '';

export function getToken() {
  return localStorage.getItem('quiz_token') || '';
}
export function setToken(t: string) {
  localStorage.setItem('quiz_token', t);
}
export function clearToken() {
  localStorage.removeItem('quiz_token');
}

export async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && !path.includes('/auth/login')) {
    clearToken();
  }
  return res;
}
