import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatDateTime, escapeHtml, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'audit-logs' });
  const logs = await api.get('/audit-logs');
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  renderTable(qs('#tableMount'), logs, [
    { key: 'created_at', label: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'user_name', label: 'User', render: (r) => `${escapeHtml(r.user_name)} <span class="text-muted">(${r.user_role})</span>` },
    { key: 'action', label: 'Action' },
    { key: 'entity', label: 'Entity' },
    { key: 'entity_id', label: 'Entity ID', render: (r) => `<span class="mono" style="font-size:.78rem;">${r.entity_id || '—'}</span>` },
  ], { pageSize: 25 });
}
main();
