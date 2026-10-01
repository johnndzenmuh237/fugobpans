import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatDate, statusBadge, qs } from './utils.js';

let currentFilter = 'PENDING';

async function load() {
  const rows = await api.get(`/leave?status=${currentFilter}`);
  renderTable(qs('#tableMount'), rows, [
    { key: 'name', label: 'Employee', render: (r) => `${r.first_name} ${r.last_name}` },
    { key: 'position_name', label: 'Position', render: (r) => r.position_name || r.department_name || '—' },
    { key: 'leave_type', label: 'Type' },
    { key: 'dates', label: 'Dates', render: (r) => `${formatDate(r.start_date)} → ${formatDate(r.end_date)}` },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
    { key: 'decision_note', label: 'Note', render: (r) => r.decision_note || '—' },
    { key: 'actions', label: '', render: (r) => r.status === 'PENDING'
        ? `<button class="btn btn-sm btn-primary" data-decide="${r.id}" data-decision="APPROVED" data-name="${r.first_name} ${r.last_name}">Approve</button>
           <button class="btn btn-sm btn-outline" data-decide="${r.id}" data-decision="DECLINED" data-name="${r.first_name} ${r.last_name}">Decline</button>` : '' },
  ], { emptyMessage: `No ${currentFilter.toLowerCase()} leave requests.` });

  qs('#tableMount').onclick = (e) => {
    const btn = e.target.closest('[data-decide]');
    if (!btn) return;
    const decision = btn.dataset.decision;
    openFormModal({
      title: `${decision === 'APPROVED' ? 'Approve' : 'Decline'} — ${btn.dataset.name}`,
      submitLabel: decision === 'APPROVED' ? 'Approve' : 'Decline',
      fields: [{ name: 'note', label: 'Note (optional — the employee will see this)', type: 'textarea', full: true }],
      onSubmit: async (v) => {
        await api.patch(`/leave/${btn.dataset.decide}/decide`, { decision, note: v.note || undefined });
        await load();
      },
    });
  };
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'leave-requests' });
  qs('#pageActions').innerHTML = `
    <select id="statusFilter" class="btn btn-outline" style="padding:8px 12px;">
      <option value="PENDING" selected>Pending</option>
      <option value="APPROVED">Approved</option>
      <option value="DECLINED">Declined</option>
    </select>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();
  qs('#statusFilter').addEventListener('change', async (e) => { currentFilter = e.target.value; await load(); });
}
main();
