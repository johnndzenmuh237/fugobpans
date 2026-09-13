import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, formatDate, escapeHtml, qs } from './utils.js';

async function main() {
  const portal = location.pathname.startsWith('/teacher/') ? 'TEACHER' : 'EMPLOYEE';
  await initPortalLayout({ portal, activeKey: 'profile' });

  const e = await api.get('/employees/me');
  const attendanceRows = (e.attendanceSummary || []).map((a) => `${a.status}: ${a.count}`).join(' · ');

  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="margin-bottom:20px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
      <span class="avatar" style="width:64px;height:64px;font-size:1.3rem;">${(e.first_name || '?')[0]}${(e.last_name || '')[0] || ''}</span>
      <div><h2 style="margin-bottom:4px;">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name)}</h2><div class="mono text-muted">${e.employee_code} · ${escapeHtml(e.position_name || '')}</div></div>
    </div>
    <div class="form-grid">
      <div class="card card-pad"><h3>Contact</h3>
        <p><strong>Phone:</strong> ${escapeHtml(e.phone || '—')}</p>
        <p><strong>WhatsApp:</strong> ${escapeHtml(e.whatsapp || '—')}</p>
        <p><strong>Email:</strong> ${escapeHtml(e.email || '—')}</p>
        <p><strong>Address:</strong> ${escapeHtml(e.address || '—')}</p>
      </div>
      <div class="card card-pad"><h3>Employment</h3>
        <p><strong>Position:</strong> ${escapeHtml(e.position_name || '—')}</p>
        <p><strong>Department:</strong> ${escapeHtml(e.department_name || '—')}</p>
        <p><strong>Start date:</strong> ${formatDate(e.start_date)}</p>
        <p><strong>Status:</strong> ${e.status}</p>
      </div>
      <div class="card card-pad"><h3>Attendance Summary</h3><p class="text-muted">${attendanceRows || 'No attendance recorded yet.'}</p></div>
      <div class="card card-pad form-row-full"><h3>Salary History</h3>
        <div class="table-wrap"><table><thead><tr><th>Effective</th><th>Basic</th><th>Net</th></tr></thead><tbody>
          ${(e.salaryHistory || []).map((h) => `<tr><td>${formatDate(h.effective_date)}</td><td>${formatCurrency(h.basic_salary)}</td><td>${formatCurrency(h.net_salary)}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty-state">Not yet set by the Manager.</div></td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;
}
main();
