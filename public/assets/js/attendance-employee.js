import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatDate, statusBadge, toast, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'EMPLOYEE', activeKey: 'attendance' });
  const me = await api.get('/employees/me');
  const history = await api.get(`/attendance/history/${me.id}`);
  const today = new Date().toISOString().slice(0, 10);
  const todayRec = history.find((h) => h.date.slice(0, 10) === today);

  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="max-width:420px;margin-bottom:24px;">
      <h3>Today</h3>
      <p class="text-muted">Status: ${todayRec ? todayRec.status : 'Not marked'}</p>
      <button id="checkInBtn" class="btn btn-primary" ${todayRec ? 'disabled' : ''}>Mark Present</button>
    </div>
    <h3>History</h3><div id="tableMount"></div>`;

  renderTable(qs('#tableMount'), history, [
    { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
  ]);

  qs('#checkInBtn').addEventListener('click', async () => {
    try { await api.post('/attendance/mark-self', {}); toast('Marked present.', 'success'); main(); } catch { /* handled */ }
  });
}
main();
