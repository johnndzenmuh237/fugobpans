/**
 * Every request includes credentials: 'include' so the httpOnly `session`
 * cookie set by /api/auth/login is sent automatically — unlike the
 * previous Firebase build, there is no ID token to fetch or attach here.
 * The cookie itself is inaccessible to JS (httpOnly), which is what
 * keeps it safe from XSS token theft.
 */
import { toast } from './utils.js';

const BASE = () => window.APP_CONFIG.API_BASE_URL;

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const url = path.startsWith('http') ? path : `${BASE()}${path}`;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if (raw) return res;
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const message = (isJson && data && data.error) || `Request failed (${res.status})`;
    toast(message, 'error');
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
window.APP_API = api;
