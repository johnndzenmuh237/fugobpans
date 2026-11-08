import { requireRole, logout, MANAGEMENT_ROLES } from './auth.js';
import { api } from './api.js';
import { initials, escapeHtml, formatDateTime } from './utils.js';

/** Sidebar structure per role (spec §31, §100). */
const NAV = {
  MANAGER: [
    { label: null, links: [{ key: 'dashboard', href: '/admin/dashboard.html', icon: '&#9632;', label: 'Overview' }] },
    { label: 'Registration', links: [
      { key: 'registrations', href: '/admin/registrations.html', icon: '&#128203;', label: 'Registrations' },
      { key: 'students', href: '/admin/students.html', icon: '&#128101;', label: 'Students' },
      { key: 'parents', href: '/admin/parents.html', icon: '&#128106;', label: 'Parents & Guardians' },
      { key: 'student-attendance', href: '/admin/student-attendance.html', icon: '&#9989;', label: 'Student Attendance' },
    ]},
    { label: 'Categories & Classes', links: [
      { key: 'categories-classes', href: '/admin/categories-classes.html', icon: '&#127891;', label: 'Categories & Classes' },
      { key: 'timetable', href: '/admin/timetable.html', icon: '&#128337;', label: 'Timetable & Terms' },
      { key: 'approvals', href: '/admin/approvals.html', icon: '&#9989;', label: 'Approvals' },
      { key: 'fee-structures', href: '/admin/fee-structures.html', icon: '&#128176;', label: 'Fees & Invoices' },
    ]},
    { label: 'Finance', links: [
      { key: 'payments', href: '/admin/payments.html', icon: '&#128179;', label: 'Payments' },
      { key: 'outstanding', href: '/admin/outstanding-fees.html', icon: '&#9888;', label: 'Outstanding Fees' },
    ]},
    { label: 'Teachers & Workers', links: [
      { key: 'employees', href: '/admin/employees.html', icon: '&#128188;', label: 'All Workers' },
      { key: 'attendance', href: '/admin/attendance.html', icon: '&#128197;', label: 'Attendance' },
      { key: 'leave', href: '/admin/leave-requests.html', icon: '&#127796;', label: 'Leave Requests' },
      { key: 'payroll', href: '/admin/payroll.html', icon: '&#128181;', label: 'Payroll' },
    ]},
    { label: 'Business Management', links: [
      { key: 'expenses', href: '/admin/expenses.html', icon: '&#128184;', label: 'Expenses' },
      { key: 'income-statement', href: '/admin/income-statement.html', icon: '&#128202;', label: 'Income Statement' },
      { key: 'budgets', href: '/admin/budgets.html', icon: '&#128203;', label: 'Budgets' },
      { key: 'debts', href: '/admin/debts.html', icon: '&#9888;', label: 'Debts & Salaries' },
      { key: 'sales', href: '/admin/sales.html', icon: '&#128176;', label: 'Sales' },
      { key: 'inventory', href: '/admin/inventory.html', icon: '&#128230;', label: 'Inventory' },
    ]},
    { label: null, links: [
      { key: 'reports', href: '/admin/reports.html', icon: '&#128200;', label: 'Reports' },
      { key: 'announcements', href: '/admin/announcements.html', icon: '&#128226;', label: 'Announcements' },
      { key: 'messages', href: '/messages.html', icon: '&#9993;', label: 'Messages' },
      { key: 'notifications', href: '/admin/notifications.html', icon: '&#128276;', label: 'Notifications' },
      { key: 'reviews', href: '/admin/reviews.html', icon: '&#11088;', label: 'Reviews' },
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
      { key: 'messages', href: '/messages.html', icon: '&#9993;', label: 'Messages' },
    ]},
    { label: 'Business Management', links: [
      { key: 'expenses', href: '/admin/expenses.html', icon: '&#128184;', label: 'Expenses' },
      { key: 'income-statement', href: '/admin/income-statement.html', icon: '&#128202;', label: 'Income Statement' },
      { key: 'debts', href: '/admin/debts.html', icon: '&#9888;', label: 'Debts & Salaries' },
      { key: 'sales', href: '/admin/sales.html', icon: '&#128176;', label: 'Sales' },
      { key: 'inventory', href: '/admin/inventory.html', icon: '&#128230;', label: 'Inventory' },
    ]},
  ],
  TEACHER: [
    { label: null, links: [
      { key: 'dashboard', href: '/teacher/dashboard.html', icon: '&#9632;', label: 'Overview' },
      { key: 'classes', href: '/teacher/classes.html', icon: '&#127891;', label: 'My Classes' },
      { key: 'students', href: '/teacher/students.html', icon: '&#128101;', label: 'My Students' },
      { key: 'results', href: '/teacher/results.html', icon: '&#128221;', label: 'Upload Results' },
      { key: 'assignments', href: '/teacher/assignments.html', icon: '&#128203;', label: 'Assignments' },
      { key: 'attendance', href: '/teacher/attendance.html', icon: '&#128197;', label: 'My Attendance' },
      { key: 'student-attendance', href: '/teacher/student-attendance.html', icon: '&#9989;', label: 'Class Attendance' },
      { key: 'schedule', href: '/teacher/schedule.html', icon: '&#128337;', label: 'My Timetable' },
      { key: 'leave', href: '/teacher/my-leave.html', icon: '&#127796;', label: 'My Leave' },
      { key: 'messages', href: '/messages.html', icon: '&#9993;', label: 'Messages' },
      { key: 'profile', href: '/teacher/profile.html', icon: '&#128100;', label: 'My Profile' },
    ]},
  ],
  EMPLOYEE: [
    { label: null, links: [
      { key: 'dashboard', href: '/employee/dashboard.html', icon: '&#9632;', label: 'Overview' },
      { key: 'attendance', href: '/employee/attendance.html', icon: '&#128197;', label: "Today's Attendance" },
      { key: 'profile', href: '/employee/profile.html', icon: '&#128100;', label: 'My Profile' },
      { key: 'messages', href: '/messages.html', icon: '&#9993;', label: 'Messages' },
    ]},
  ],
  STUDENT: [
    { label: null, links: [
      { key: 'dashboard', href: '/student/dashboard.html', icon: '&#9632;', label: 'My Dashboard' },
      { key: 'fees', href: '/student/dashboard.html#fees', icon: '&#128176;', label: 'Fees & Payments' },
      { key: 'results', href: '/student/dashboard.html#results', icon: '&#128221;', label: 'My Results' },
      { key: 'assignments', href: '/student/dashboard.html#assignments', icon: '&#128203;', label: 'Assignments' },
      { key: 'schedule', href: '/student/dashboard.html#schedule', icon: '&#128337;', label: 'Class Timetable' },
      { key: 'attendance', href: '/student/dashboard.html#attendance', icon: '&#9989;', label: 'My Attendance' },
      { key: 'messages', href: '/messages.html', icon: '&#9993;', label: 'Messages' },
    ]},
  ],
};
NAV.PARENT = [
  { label: null, links: [
    { key: 'dashboard', href: '/parent/dashboard.html', icon: '&#9632;', label: 'My Children' },
    { key: 'results', href: '/parent/dashboard.html#results', icon: '&#128221;', label: 'Results & Report Cards' },
    { key: 'attendance', href: '/parent/dashboard.html#attendance', icon: '&#9989;', label: 'Attendance' },
    { key: 'fees', href: '/parent/dashboard.html#fees', icon: '&#128176;', label: 'Fees & Payments' },
    { key: 'schedule', href: '/parent/dashboard.html#schedule', icon: '&#128337;', label: 'Timetable' },
    { key: 'messages', href: '/messages.html', icon: '&#9993;', label: 'Messages & Announcements' },
  ]},
];
// The Owner sees everything the management side has, plus the controls only the Owner has.
NAV.OWNER = [
  { label: 'Owner', links: [
    { key: 'owner-dashboard', href: '/owner/dashboard.html', icon: '&#9632;', label: 'School Overview' },
    { key: 'owner-management', href: '/owner/management.html', icon: '&#128273;', label: 'Principals & Administrators' },
    { key: 'owner-records', href: '/owner/records.html', icon: '&#128193;', label: 'School Records' },
  ]},
  ...NAV.MANAGER.filter((g) => g.label !== null || g.links[0].key !== 'dashboard'),
];

// Which Owner-granted permission unlocks each management menu item (the server enforces the same rules).
const LINK_PERMISSION = {
  registrations: 'registrations', students: 'students', parents: 'students', 'student-attendance': 'students',
  'categories-classes': 'academics', timetable: 'academics', approvals: 'academics',
  'fee-structures': 'finance', payments: 'finance', outstanding: 'finance', payroll: 'finance', expenses: 'finance', 'income-statement': 'finance',
  budgets: 'finance', debts: 'finance', sales: 'finance', inventory: 'finance',
  employees: 'teachers', attendance: 'teachers', leave: 'teachers',
  reports: 'reports', 'audit-logs': 'reports', reviews: 'reports', announcements: 'announcements',
};
const TOP_LEVEL_ONLY = ['settings'];

function navFor(profile) {
  if (profile.role === 'OWNER') return NAV.OWNER;
  if (profile.role === 'MANAGER') return NAV.MANAGER;
  if (MANAGEMENT_ROLES.includes(profile.role)) {
    const perms = profile.permissions || {};
    return NAV.MANAGER.map((g) => ({ ...g, links: g.links.filter((l) => !TOP_LEVEL_ONLY.includes(l.key) && (!LINK_PERMISSION[l.key] || perms[LINK_PERMISSION[l.key]] === true)) })).filter((g) => g.links.length);
  }
  return NAV[profile.role] || [];
}

const ROLE_GROUPS = { OWNER: ['OWNER'], MANAGER: ['MANAGER'], ACCOUNTANT: ['ACCOUNTANT'], TEACHER: ['TEACHER'], EMPLOYEE: ['EMPLOYEE'], STUDENT: ['STUDENT'], PARENT: ['PARENT'], ALL: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'TEACHER', 'EMPLOYEE', 'STUDENT', 'PARENT'] };

function renderSidebar(groups, activeKey) {
  return groups.map((g) => `
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
  bell.style.position = 'relative';
  const badge = document.createElement('span');
  badge.className = 'notif-badge'; badge.style.display = 'none';
  bell.appendChild(badge);

  async function refreshCount() {
    try {
      const { count } = await api.get('/notifications/unread-count');
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = count ? '' : 'none';
      bell.setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications');
    } catch { /* bell stays quiet if the API is briefly unreachable */ }
  }
  refreshCount();
  setInterval(refreshCount, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCount(); });

  const TYPE_ICON = { SUCCESS: '&#9989;', WARNING: '&#9888;', ERROR: '&#10060;', INFO: '&#8505;' };
  async function load() {
    panel.innerHTML = '<div class="notif-item">Loading…</div>';
    try {
      const items = await api.get('/notifications?limit=30');
      const head = `<div class="notif-head"><strong>Notifications</strong><button type="button" id="notifReadAll" class="btn btn-ghost btn-sm">Mark all read</button></div>`;
      panel.innerHTML = head + (items.length ? items.map((n) => {
        const from = [n.sender_name && n.sender_name !== 'System' ? escapeHtml(n.sender_name) : 'System', n.department ? escapeHtml(n.department) : ''].filter(Boolean).join(' · ');
        return `<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link ? escapeHtml(n.link) : ''}" style="cursor:pointer;">
          <div class="title">${TYPE_ICON[n.type] || ''} ${escapeHtml(n.title)}</div><div>${escapeHtml(n.message)}</div>
          <div class="text-muted" style="margin-top:4px;font-size:.75rem;">${from} · ${formatDateTime(n.created_at)}${n.link ? ' · <u>Open</u>' : ''}</div></div>`;
      }).join('') : '<div class="notif-item text-muted">No notifications yet.</div>');
      panel.querySelector('#notifReadAll')?.addEventListener('click', async (e) => { e.stopPropagation(); await api.post('/notifications/read-all', {}); await load(); refreshCount(); });
      panel.querySelectorAll('.notif-item[data-id]').forEach((el) => el.addEventListener('click', async () => {
        try { await api.patch(`/notifications/${el.dataset.id}/read`, {}); } catch {}
        el.classList.remove('unread'); refreshCount();
        if (el.dataset.link) window.location.href = el.dataset.link;
      }));
    } catch { panel.innerHTML = '<div class="notif-item text-muted">Could not load notifications.</div>'; }
  }
  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden'); await load();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => panel.classList.add('hidden'));
}

export async function initPortalLayout({ portal, activeKey }) {
  // `portal` is usually a single role key (e.g. 'MANAGER'), but pages shared
  // across roles (like the Business Management pages, open to Manager AND
  // Accountant) can pass an array of allowed roles instead.
  const allowedRoles = Array.isArray(portal) ? portal : ROLE_GROUPS[portal];
  const profile = await requireRole(allowedRoles);
  const navEl = document.getElementById('sidebarNav');
  if (navEl) navEl.innerHTML = renderSidebar(navFor(profile), activeKey);
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = profile.name || profile.email;
  if (avatarEl) avatarEl.textContent = initials(...(profile.name || profile.email || '?').split(' '));
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  wireDrawer();
  wireNotifications();
  return profile;
}
