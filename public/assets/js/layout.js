import { requireRole, logout } from './auth.js';
import { api } from './api.js';
import { initials, escapeHtml, formatDateTime } from './utils.js';

/** Sidebar structure per role (spec §31, §100). */
const NAV = {
  MANAGER: [
    { label: null, links: [{ key: 'dashboard', href: '/admin/dashboard.html', icon: '&#9632;', label: 'Overview' }] },
    { label: 'Registration', links: [
      { key: 'registrations', href: '/admin/registrations.html', icon: '&#128203;', label: 'Registrations' },
      { key: 'students', href: '/admin/students.html', icon: '&#128101;', label: 'Students' },
    ]},
    { label: 'Categories & Classes', links: [
      { key: 'categories-classes', href: '/admin/categories-classes.html', icon: '&#127891;', label: 'Categories & Classes' },
      { key: 'fee-structures', href: '/admin/fee-structures.html', icon: '&#128176;', label: 'Fees & Invoices' },
    ]},
    { label: 'Finance', links: [
      { key: 'payments', href: '/admin/payments.html', icon: '&#128179;', label: 'Payments' },
      { key: 'outstanding', href: '/admin/outstanding-fees.html', icon: '&#9888;', label: 'Outstanding Fees' },
    ]},
    { label: 'Teachers & Workers', links: [
      { key: 'employees', href: '/admin/employees.html', icon: '&#128188;', label: 'All Workers' },
      { key: 'attendance', href: '/admin/attendance.html', icon: '&#128197;', label: 'Attendance' },
      { key: 'payroll', href: '/admin/payroll.html', icon: '&#128181;', label: 'Payroll' },
    ]},
    { label: null, links: [
      { key: 'reports', href: '/admin/reports.html', icon: '&#128202;', label: 'Reports' },
      { key: 'notifications', href: '/admin/notifications.html', icon: '&#128276;', label: 'Notifications' },
      { key: 'audit-logs', href: '/admin/audit-logs.html', icon: '&#128272;', label: 'Audit Log' },
      { key: 'settings', href: '/admin/settings.html', icon: '&#9881;', label: 'Settings' },
    ]},
  ],
  ACCOUNTANT: [
    { label: null, links: [
      { key: 'dashboard', href: '/accountant/dashboard.html', icon: '&#9632;', label: 'Overview' },
      { key: 'payments', href: '/accountant/payments.html', icon: '&#128179;', label: 'Payments' },
      { key: 'outstanding', href: '/accountant/outstanding-fees.html', icon: '&#9888;', label: 'Outstanding Fees' },
      { key: 'receipts', href: '/accountant/receipts.html', icon: '&#128196;', label: 'Receipts' },
    ]},
  ],
  TEACHER: [
    { label: null, links: [
      { key: 'dashboard', href: '/teacher/dashboard.html', icon: '&#9632;', label: 'Overview' },
      { key: 'classes', href: '/teacher/classes.html', icon: '&#127891;', label: 'My Classes' },
      { key: 'students', href: '/teacher/students.html', icon: '&#128101;', label: 'My Students' },
      { key: 'results', href: '/teacher/results.html', icon: '&#128221;', label: 'Upload Results' },
      { key: 'attendance', href: '/teacher/attendance.html', icon: '&#128197;', label: 'My Attendance' },
      { key: 'profile', href: '/teacher/profile.html', icon: '&#128100;', label: 'My Profile' },
    ]},
  ],
  EMPLOYEE: [
    { label: null, links: [
      { key: 'dashboard', href: '/employee/dashboard.html', icon: '&#9632;', label: 'Overview' },
      { key: 'attendance', href: '/employee/attendance.html', icon: '&#128197;', label: "Today's Attendance" },
      { key: 'profile', href: '/employee/profile.html', icon: '&#128100;', label: 'My Profile' },
    ]},
  ],
  STUDENT: [
    { label: null, links: [
      { key: 'dashboard', href: '/student/dashboard.html', icon: '&#9632;', label: 'My Dashboard' },
      { key: 'fees', href: '/student/dashboard.html#fees', icon: '&#128176;', label: 'Fees & Payments' },
      { key: 'results', href: '/student/dashboard.html#results', icon: '&#128221;', label: 'My Results' },
    ]},
  ],
};
const ROLE_GROUPS = { MANAGER: ['MANAGER'], ACCOUNTANT: ['ACCOUNTANT'], TEACHER: ['TEACHER'], EMPLOYEE: ['EMPLOYEE'], STUDENT: ['STUDENT'] };

function renderSidebar(portal, activeKey) {
  return (NAV[portal] || []).map((g) => `
    <div class="nav-group">
      ${g.label ? `<div class="nav-group-label">${g.label}</div>` : ''}
      ${g.links.map((l) => `<a class="nav-link ${l.key === activeKey ? 'is-active' : ''}" href="${l.href}"><span class="icon">${l.icon}</span> ${l.label}</a>`).join('')}
    </div>`).join('');
}

function wireDrawer() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const open = () => { sidebar?.classList.add('is-open'); backdrop?.classList.add('is-open'); document.body.style.overflow = 'hidden'; };
  const close = () => { sidebar?.classList.remove('is-open'); backdrop?.classList.remove('is-open'); document.body.style.overflow = ''; };
  document.querySelectorAll('[data-drawer-target="#appSidebar"]').forEach((btn) => btn.addEventListener('click', () => (sidebar?.classList.contains('is-open') ? close() : open())));
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.querySelectorAll('#appSidebar .nav-link').forEach((a) => a.addEventListener('click', close));
}

async function wireNotifications() {
  const bell = document.getElementById('notifBell');
  const panel = document.getElementById('notifPanel');
  if (!bell || !panel) return;
  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="notif-item">Loading…</div>';
    try {
      const items = await api.get('/notifications');
      panel.innerHTML = items.length
        ? items.slice(0, 20).map((n) => `<div class="notif-item ${n.read ? '' : 'unread'}"><div class="title">${escapeHtml(n.title)}</div><div>${escapeHtml(n.message)}</div><div class="text-muted" style="margin-top:4px;font-size:.75rem;">${formatDateTime(n.created_at)}</div></div>`).join('')
        : '<div class="notif-item text-muted">No notifications yet.</div>';
    } catch { panel.innerHTML = '<div class="notif-item text-muted">Could not load notifications.</div>'; }
  });
  document.addEventListener('click', () => panel.classList.add('hidden'));
}

export async function initPortalLayout({ portal, activeKey }) {
  const profile = await requireRole(ROLE_GROUPS[portal]);
  const navEl = document.getElementById('sidebarNav');
  if (navEl) navEl.innerHTML = renderSidebar(portal, activeKey);
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = profile.name || profile.email;
  if (avatarEl) avatarEl.textContent = initials(...(profile.name || profile.email || '?').split(' '));
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  wireDrawer();
  wireNotifications();
  return profile;
}
