import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, toast, qs } from './utils.js';

async function load() {
  const [summary, roster] = await Promise.all([api.get('/attendance/today-summary'), api.get('/attendance/roster')]);
  qs('#pageRoot').innerHTML = `
    <div class="stat-grid" style="margin-bottom:22px;">
      <div class="stat-card"><div class="label">Total Workers</div><div class="value">${summary.total}</div></div>
      <div class="stat-card"><div class="label">Present</div><div class="value">${summary.present}</div></div>
      <div class="stat-card"><div class="label">Absent</div><div class="value">${summary.absent}</div></div>
      <div class="stat-card"><div class="label">Not Marked</div><div class="value">${summary.notMarked}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Worker</th><th>Position</th><th>Status</th></tr></thead><tbody>
      ${roster.map((r) => `
        <tr>
          <td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td>
          <td>${escapeHtml(r.position_name || '—')}</td>
          <td><select data-emp="${r.employee_id}">
            ${['NOT_MARKED', 'PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'].map((st) => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${st.replace('_', ' ')}</option>`).join('')}
          </select></td>
        </tr>`).join('')}
    </tbody></table></div>
    <button id="saveBtn" class="btn btn-primary" style="margin-top:14px;">Save Attendance</button>
    <button id="sweepBtn" class="btn btn-outline" style="margin-top:14px;">Run Auto-Absence Sweep</button>`;

  qs('#saveBtn').addEventListener('click', async () => {
    const selects = Array.from(document.querySelectorAll('[data-emp]')).filter((s) => s.value !== 'NOT_MARKED');
    await Promise.all(selects.map((sel) => api.post('/attendance/mark-manual', { employeeId: sel.dataset.emp, status: sel.value })));
    toast('Attendance saved.', 'success');
    load();
  });
  qs('#sweepBtn').addEventListener('click', async () => {
    const result = await api.post('/attendance/run-sweep', {});
    toast(`${result.markedAbsent} worker(s) marked absent (no attendance recorded).`, 'success');
    load();
  });
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'attendance' });
  await load();
}
main();
