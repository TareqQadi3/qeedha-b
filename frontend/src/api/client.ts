const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

const ACCESS_TOKEN_KEY = 'qeedha_access_token';
const REFRESH_TOKEN_KEY = 'qeedha_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setSession(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  skipAuth?: boolean;
}

async function rawRequest(path: string, options: RequestOptions = {}) {
  const url = new URL(BASE_URL.replace(/\/$/, '') + path, window.location.origin);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options.skipAuth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(data?.error?.message ?? `خطأ غير متوقع (${res.status})`, res.status, data?.error?.code);
  }
  return data;
}

/** One-shot refresh-and-retry on 401, since access tokens are short-lived (15m). */
async function request(path: string, options: RequestOptions = {}) {
  try {
    return await rawRequest(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !options.skipAuth) {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        try {
          const refreshed = await rawRequest('/auth/refresh', {
            method: 'POST',
            body: { refreshToken },
            skipAuth: true,
          });
          setSession(refreshed.accessToken, refreshed.refreshToken);
          return await rawRequest(path, options);
        } catch {
          clearSession();
        }
      }
    }
    throw err;
  }
}

export const api = {
  get: (path: string, query?: RequestOptions['query']) => request(path, { method: 'GET', query }),
  post: (path: string, body?: unknown, skipAuth = false) => request(path, { method: 'POST', body, skipAuth }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};
