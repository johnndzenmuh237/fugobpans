import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatDateTime, qs } from './utils.js';

async function load() {
  const rows = await api.get('/announcements');
  renderTable(qs('#tableMount'), rows, [
    { key: 'title', label: 'Title' },
    { key: 'audience', label: 'Audience' },
    { key: 'pinned', label: 'Pinned', render: (r) => (r.pinned ? '📌 Yes' : 'No') },
    { key: 'status', label: 'Status', render: (r) => (r.status === 'ACTIVE' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Archived</span>') },
    { key: 'created_at', label: 'Posted', render: (r) => formatDateTime(r.created_at) },
    { key: 'actions', label: '', render: (r) => r.status === 'ACTIVE'
        ? `<button class="btn btn-sm btn-outline" data-archive="${r.id}">Archive</button>`
        : `<button class="btn btn-sm btn-outline" data-activate="${r.id}">Re-activate</button>` },
  ], { emptyMessage: 'No announcements posted yet.' });

  qs('#tableMount').onclick = async (e) => {
    const archiveBtn = e.target.closest('[data-archive]');
    if (archiveBtn) { await api.patch(`/announcements/${archiveBtn.dataset.archive}/status`, { status: 'ARCHIVED' }); await load(); return; }
    const activateBtn = e.target.closest('[data-activate]');
    if (activateBtn) { await api.patch(`/announcements/${activateBtn.dataset.activate}/status`, { status: 'ACTIVE' }); await load(); }
  };
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'announcements' });
  qs('#pageActions').innerHTML = `<button id="newBtn" class="btn btn-primary">New Announcement</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();

  qs('#newBtn').addEventListener('click', () => openFormModal({
    title: 'New Announcement',
    submitLabel: 'Post',
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'body', label: 'Message', type: 'textarea', required: true, full: true },
      { name: 'audience', label: 'Audience', type: 'select', options: [{ value: 'ALL', label: 'Everyone' }, { value: 'PARENTS', label: 'Parents Only' }, { value: 'STAFF', label: 'Staff Only' }] },
      { name: 'pinned', label: 'Pin to top?', type: 'select', options: [{ value: '', label: 'No' }, { value: 'true', label: 'Yes' }] },
    ],
    onSubmit: async (v) => { await api.post('/announcements', { ...v, pinned: v.pinned === 'true' }); await load(); },
  }));
}
main();
