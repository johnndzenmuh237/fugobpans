import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, formatDateTime, qs } from './utils.js';

async function load() {
  const items = await api.get('/notifications');
  qs('#pageRoot').innerHTML = items.length ? items.map((n) => `
    <div class="card card-pad ${n.read ? '' : 'notif-item unread'}" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;">
        <strong>${escapeHtml(n.title)}</strong>
        ${!n.read ? `<button class="btn btn-sm btn-outline" data-read="${n.id}">Mark read</button>` : ''}
      </div>
      <p style="margin:6px 0 0;">${escapeHtml(n.message)}</p>
      <p class="text-muted" style="font-size:.78rem;margin-top:6px;">${formatDateTime(n.created_at)}</p>
    </div>`).join('') : '<div class="empty-state">No notifications yet.</div>';

  qs('#pageRoot').querySelectorAll('[data-read]').forEach((btn) => btn.addEventListener('click', async () => { await api.patch(`/notifications/${btn.dataset.read}/read`, {}); load(); }));
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'notifications' });
  await load();
}
main();
