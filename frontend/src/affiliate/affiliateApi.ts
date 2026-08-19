import { ApiError } from '../api/client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const AFFILIATE_TOKEN_KEY = 'qeedha_affiliate_token';

/**
 * A separate, minimal client for the affiliate self-service API (Phase 9
 * "Affiliate Dashboard") - same reasoning as adminApi.ts: a single
 * longer-lived token with no refresh flow (AffiliateAuthGuard), a
 * completely separate trust boundary from both the tenant session and
 * the Control Center session, so it gets its own token store rather than
 * reusing either.
 */
export function getAffiliateToken() {
  return localStorage.getItem(AFFILIATE_TOKEN_KEY);
}

export function setAffiliateToken(token: string) {
  localStorage.setItem(AFFILIATE_TOKEN_KEY, token);
}

export function clearAffiliateToken() {
  localStorage.removeItem(AFFILIATE_TOKEN_KEY);
}

async function request(path: string, options: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAffiliateToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE_URL.replace(/\/$/, '') + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) clearAffiliateToken();
    throw new ApiError(data?.error?.message ?? `خطأ غير متوقع (${res.status})`, res.status, data?.error?.code);
  }
  return data;
}

export const affiliateApi = {
  get: (path: string) => request(path, { method: 'GET' }),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body }),
};
