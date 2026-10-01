import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatDate, statusBadge, qs } from './utils.js';

async function load() {
  const rows = await api.get('/leave/mine');
  renderTable(qs('#tableMount'), rows, [
    { key: 'leave_type', label: 'Type' },
    { key: 'dates', label: 'Dates', render: (r) => `${formatDate(r.start_date)} → ${formatDate(r.end_date)}` },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
    { key: 'decision_note', label: "Manager's Note", render: (r) => r.decision_note || '—' },
    { key: 'requested_at', label: 'Submitted', render: (r) => formatDate(r.requested_at) },
  ], { emptyMessage: "You haven't submitted any leave requests yet." });
}

async function main() {
  const portal = window.location.pathname.includes('/teacher/') ? 'TEACHER' : 'EMPLOYEE';
  await initPortalLayout({ portal, activeKey: 'my-leave' });

  qs('#pageActions').innerHTML = `<button id="newBtn" class="btn btn-primary">Request Leave</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();

  qs('#newBtn').addEventListener('click', () => openFormModal({
    title: 'Request Leave / Permission',
    submitLabel: 'Submit Request',
    fields: [
      { name: 'leaveType', label: 'Type', type: 'select', options: [
        { value: 'SICK', label: 'Sick Leave' }, { value: 'ANNUAL', label: 'Annual Leave' },
        { value: 'PERMISSION', label: 'Permission (short absence)' }, { value: 'OTHER', label: 'Other' },
      ]},
      { name: 'startDate', label: 'Start Date', type: 'date', required: true },
      { name: 'endDate', label: 'End Date', type: 'date', required: true },
      { name: 'reason', label: 'Reason', type: 'textarea', full: true },
    ],
    onSubmit: async (v) => { await api.post('/leave/mine', v); await load(); },
  }));
}
main();
