import { api } from './api.js';
import { toast } from './utils.js';

const HOME_BY_ROLE = {
  OWNER: '/owner/dashboard.html',
  PRINCIPAL: '/admin/dashboard.html',
  VICE_PRINCIPAL: '/admin/dashboard.html',
  ADMINISTRATOR: '/admin/dashboard.html',
  ACADEMIC_ADMIN: '/admin/dashboard.html',
  PARENT: '/parent/dashboard.html',
  MANAGER: '/admin/dashboard.html',
  ACCOUNTANT: '/accountant/dashboard.html',
  TEACHER: '/teacher/dashboard.html',
  EMPLOYEE: '/employee/dashboard.html',
  STUDENT: '/student/dashboard.html',
};

// Every role that runs the school day to day shares the "management" pages the original MANAGER used.
export const MANAGEMENT_ROLES = ['OWNER', 'MANAGER', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ADMINISTRATOR', 'ACADEMIC_ADMIN'];
export function homeFor(role) { return HOME_BY_ROLE[role] || '/index.html'; }

export async function login(email, password) {
  const profile = await api.post('/auth/login', { email, password });
  sessionStorage.setItem('fugobs_profile', JSON.stringify(profile));
  window.location.href = profile.mustChangePassword ? '/change-password.html' : homeFor(profile.role);
  return profile;
}

export async function logout() {
  try { const { detachDevice } = await import('./push-client.js'); await detachDevice(); } catch { /* push is optional */ }
  await api.post('/auth/logout', {});
  sessionStorage.removeItem('fugobs_profile');
  window.location.href = '/login.html';
}

/** Guards a portal page — redirects to /login.html if not authenticated/authorized. */
export async function requireRole(allowedRoles) {
  try {
    const profile = await api.get('/auth/me');
    sessionStorage.setItem('fugobs_profile', JSON.stringify(profile));
    if (profile.mustChangePassword && !location.pathname.endsWith('/change-password.html')) {
      window.location.href = '/change-password.html';
      return new Promise(() => {}); // page is navigating away; stop this page's script quietly
    }
    // Pages written for MANAGER are open to the Owner and the management posts; the server enforces what each may actually do.
    const roles = allowedRoles && allowedRoles.includes('MANAGER') ? [...new Set([...allowedRoles, ...MANAGEMENT_ROLES])] : allowedRoles;
    if (roles && !roles.includes(profile.role)) {
      toast('You do not have access to that page.', 'error');
      window.location.href = HOME_BY_ROLE[profile.role] || '/login.html';
      return new Promise(() => {});
    }
    return profile;
  } catch (e) {
    // A logged-in person on the wrong page has already been redirected to their own home; only a real
    // authentication failure should go to the login page.
    if (e.message !== 'unauthorized' && e.message !== 'password-change-required') window.location.href = '/login.html';
    throw e;
  }
}

export function currentProfile() {
  try { return JSON.parse(sessionStorage.getItem('fugobs_profile') || 'null'); } catch { return null; }
}
