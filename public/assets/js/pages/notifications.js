import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { qs, escapeHtml, formatDateTime } from '../utils.js';
async function main() {
  await initPortalLayout({ activeKey: 'notifications', title: 'Notifications', subtitle: 'New tenants, payments awaiting confirmation, enquiries, maintenance and alerts.' });
  const rows = await api.get('/notifications');
  qs('#pageRoot').innerHTML = rows.length ? rows.map((n) => `<div class="notice-card k-${n.type === 'ERROR' ? 'URGENT' : n.type === 'WARNING' ? 'PAYMENT' : 'NOTICE'}"><strong>${escapeHtml(n.title)}</strong><div>${escapeHtml(n.message)}</div><div class="text-muted" style="font-size:.76rem;margin-top:4px">${formatDateTime(n.created_at)}${n.link ? ` · <a href="${escapeHtml(n.link)}">Open</a>` : ''}</div></div>`).join('') : '<div class="empty-state card">No notifications yet.</div>';
  api.post('/notifications/read-all', {}, { silent: true });
}
main();
