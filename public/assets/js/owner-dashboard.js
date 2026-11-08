import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, formatCurrency, formatDateTime } from './ui.js';

const root = document.getElementById('pageRoot');
const rec = (type, label, num, sub = '') => `<a class="stat-link" href="/owner/records.html?type=${type}"><div class="num">${num}</div><div class="lbl">${label}${sub ? ` · ${sub}` : ''}</div></a>`;
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v}%`);

(async () => {
  await initPortalLayout({ portal: 'OWNER', activeKey: 'owner-dashboard' });
  const d = await api.get('/owner/overview');
  const c = d.counts, f = d.finance, a = d.attendance, p = d.pendingApprovals;
  const maxEnrol = Math.max(1, ...d.enrollment.byClass.map((x) => x.students));
  const maxTrend = Math.max(1, ...f.trend.map((t) => Math.max(t.collected, t.expenses)));

  root.innerHTML = `
  <div class="stat-grid">
    ${rec('students', 'Students', c.students)}${rec('teachers', 'Teachers', c.teachers)}${rec('employees', 'Employees', c.employees)}
    ${rec('classes', 'Classes', c.classes)}${rec('departments', 'Departments', c.departments)}${rec('administrators', 'Administrators', c.administrators)}${rec('parents', 'Parents', c.parents)}
  </div>

  <h2>Needs your attention</h2>
  <div class="stat-grid">
    <a class="stat-link" href="/admin/approvals.html"><div class="num">${p.results}</div><div class="lbl">Result sets awaiting approval</div></a>
    <a class="stat-link" href="/admin/approvals.html"><div class="num">${p.expenses}</div><div class="lbl">Expenses awaiting approval</div></a>
    <a class="stat-link" href="/admin/leave-requests.html"><div class="num">${p.leave}</div><div class="lbl">Leave requests pending</div></a>
    <a class="stat-link" href="/messages.html"><div class="num">${d.unreadMessages}</div><div class="lbl">Unread messages</div></a>
    <div class="stat-link"><div class="num">${d.unreadNotifications}</div><div class="lbl">Unread notifications (bell)</div></div>
  </div>

  <h2>Finance</h2>
  <div class="stat-grid">
    ${rec('invoices', 'Fees expected', formatCurrency(f.expected))}${rec('payments', 'Fees collected', formatCurrency(f.collected), pct(f.collectionRate))}
    ${rec('outstanding', 'Outstanding fees', formatCurrency(f.outstanding))}${rec('expenses', 'Approved expenses', formatCurrency(f.expenses), `${formatCurrency(f.expensesThisMonth)} this month`)}
    <div class="stat-link"><div class="num" style="color:${f.net < 0 ? '#dc2626' : '#15803d'}">${formatCurrency(f.net)}</div><div class="lbl">Net position (collected − expenses)</div></div>
  </div>
  <div class="card card-pad"><strong>Last 6 months</strong>
    ${f.trend.map((t) => `<div class="bar-row"><span style="width:70px">${t.month}</span>
      <span class="bar" style="width:${(t.collected / maxTrend) * 55}%;background:#15803d" title="Collected"></span><span>${formatCurrency(t.collected)}</span></div>
      <div class="bar-row"><span style="width:70px"></span><span class="bar" style="width:${(t.expenses / maxTrend) * 55}%;background:#dc2626" title="Expenses"></span><span>${formatCurrency(t.expenses)}</span></div>`).join('')}
    <p class="text-muted" style="font-size:.8rem;margin-top:8px;">Green = fees collected, red = approved expenses.</p></div>

  <h2>Attendance today</h2>
  <div class="stat-grid">
    <a class="stat-link" href="/owner/records.html?type=attendance"><div class="num">${pct(a.students.rate)}</div><div class="lbl">Students present (${a.students.present}/${a.students.marked} marked)</div></a>
    <a class="stat-link" href="/admin/attendance.html"><div class="num">${pct(a.staff.rate)}</div><div class="lbl">Staff present (${a.staff.present}/${a.staff.marked} marked)</div></a>
  </div>

  <h2>Enrollment</h2>
  <div class="card card-pad">
    <p><a href="/owner/records.html?type=registrations"><strong>${d.enrollment.newLast7Days}</strong> new students in the last 7 days · <strong>${d.enrollment.newLast30Days}</strong> in the last 30</a></p>
    ${d.enrollment.byClass.map((x) => `<div class="bar-row"><span style="width:130px">${escapeHtml(x.class_name)}</span><span class="bar" style="width:${(x.students / maxEnrol) * 55}%"></span><span>${x.students}</span></div>`).join('') || '<p class="text-muted">No classes yet.</p>'}
  </div>

  <h2>Academic performance <span class="text-muted" style="font-size:.9rem">(approved results only${d.academics.schoolAverage !== null ? ` · school average ${d.academics.schoolAverage}%` : ''})</span></h2>
  <div class="card card-pad"><div class="table-wrap"><table><thead><tr><th>Class</th><th>Average</th><th>Pass rate (≥50%)</th><th>Entries</th></tr></thead><tbody>
    ${d.academics.byClass.map((x) => `<tr><td>${escapeHtml(x.class_name)}</td><td>${x.average}%</td><td>${x.pass_rate}%</td><td>${x.entries}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">No approved results yet.</td></tr>'}
  </tbody></table></div><p><a href="/owner/records.html?type=results">Open all examination results →</a></p></div>

  <div class="form-grid" style="gap:16px;">
    <div class="card card-pad"><h3>Recent school activity</h3>
      ${d.recentActivity.map((x) => `<div style="padding:6px 0;border-bottom:1px solid var(--slate-100);font-size:.85rem;"><strong>${escapeHtml(x.user_name || 'System')}</strong> ${escapeHtml(String(x.action).replace(/_/g, ' ').toLowerCase())}
        <div class="text-muted" style="font-size:.75rem;">${formatDateTime(x.created_at)}</div></div>`).join('') || '<p class="text-muted">Nothing yet.</p>'}
      <p style="margin-top:8px;"><a href="/owner/records.html?type=activity">Full activity log →</a></p></div>
    <div class="card card-pad"><h3>Announcements</h3>
      ${d.announcements.map((x) => `<div style="padding:6px 0;border-bottom:1px solid var(--slate-100);">${escapeHtml(x.title)}<div class="text-muted" style="font-size:.75rem;">${formatDateTime(x.created_at)}</div></div>`).join('') || '<p class="text-muted">None published.</p>'}
      <p style="margin-top:8px;"><a href="/admin/announcements.html">Manage announcements →</a></p></div>
  </div>`;
})();
