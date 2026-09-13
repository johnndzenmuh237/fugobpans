import { api } from './api.js';
import { toast } from './utils.js';

const HOME_BY_ROLE = {
  MANAGER: '/admin/dashboard.html',
  ACCOUNTANT: '/accountant/dashboard.html',
  TEACHER: '/teacher/dashboard.html',
  EMPLOYEE: '/employee/dashboard.html',
  STUDENT: '/student/dashboard.html',
};

export async function login(email, password) {
  const profile = await api.post('/auth/login', { email, password });
  sessionStorage.setItem('fugobs_profile', JSON.stringify(profile));
  window.location.href = HOME_BY_ROLE[profile.role] || '/index.html';
  return profile;
}

export async function logout() {
  await api.post('/auth/logout', {});
  sessionStorage.removeItem('fugobs_profile');
  window.location.href = '/login.html';
}

/** Guards a portal page — redirects to /login.html if not authenticated/authorized. */
export async function requireRole(allowedRoles) {
  try {
    const profile = await api.get('/auth/me');
    sessionStorage.setItem('fugobs_profile', JSON.stringify(profile));
    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      toast('You do not have access to that page.', 'error');
      window.location.href = HOME_BY_ROLE[profile.role] || '/login.html';
      throw new Error('unauthorized');
    }
    return profile;
  } catch (e) {
    window.location.href = '/login.html';
    throw e;
  }
}

export function currentProfile() {
  try { return JSON.parse(sessionStorage.getItem('fugobs_profile') || 'null'); } catch { return null; }
}
