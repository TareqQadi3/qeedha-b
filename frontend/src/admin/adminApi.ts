import { ApiError } from '../api/client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const ADMIN_TOKEN_KEY = 'qeedha_platform_admin_token';

/**
 * A separate, minimal client for the SaaS control-panel API - deliberately
 * NOT built on top of `api/client.ts`. That client's 401-refresh-and-retry
 * logic is tied to the tenant session's refresh-token flow
 * (POST /auth/refresh), which platform admins don't have (see
 * PlatformAdminAuthGuard: a single longer-lived token, no refresh token at
 * all). Reusing it here would either silently do nothing on 401 or, worse,
 * risk mixing the two token stores. On 401 this just clears the admin
 * token and lets the caller redirect to /admin/login.
 */
export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request(path: string, options: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE_URL.replace(/\/$/, '') + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) clearAdminToken();
    throw new ApiError(data?.error?.message ?? `خطأ غير متوقع (${res.status})`, res.status, data?.error?.code);
  }
  return data;
}

export const adminApi = {
  get: (path: string) => request(path, { method: 'GET' }),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body }),
};
