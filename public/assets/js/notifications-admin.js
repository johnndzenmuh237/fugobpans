import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, formatDateTime, qs, toast } from './utils.js';
import { modal } from './ui.js';

async function load() {
  const items = await api.get('/notifications?limit=200');
  qs('#pageRoot').innerHTML = items.length ? items.map((n) => `
    <div class="card card-pad ${n.read ? '' : 'notif-item unread'}" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;">
        <strong>${escapeHtml(n.title)}</strong>
        ${!n.read ? `<button class="btn btn-sm btn-outline" data-read="${n.id}">Mark read</button>` : ''}
      </div>
      <p style="margin:6px 0 0;">${escapeHtml(n.message)}</p>
      <p class="text-muted" style="font-size:.78rem;margin-top:6px;">${formatDateTime(n.created_at)}</p>
      ${n.link ? `<p style="margin:6px 0 0;"><a href="${escapeHtml(n.link)}">Open</a></p>` : ''}
    </div>`).join('') : '<div class="empty-state">No notifications yet.</div>';

  qs('#pageRoot').querySelectorAll('[data-read]').forEach((btn) => btn.addEventListener('click', async () => { await api.patch(`/notifications/${btn.dataset.read}/read`, {}); load(); }));
}

const AUDIENCES = [['ALL', 'Everyone (all dashboards)'], ['STAFF', 'All staff (teachers, employees, accountants)'], ['TEACHERS', 'Teachers'], ['EMPLOYEES', 'Employees'], ['ACCOUNTANTS', 'Accountants'],
  ['PARENTS', 'Parents'], ['STUDENTS', 'Students'], ['MANAGEMENT', 'Management team'], ['USER', 'One specific person…']];

async function openSend() {
  const people = await api.get('/messages/contacts');
  const m = modal('Send a notification', `<form id="sendForm">
    <div class="field"><label>Send to</label><select name="audience" required>${AUDIENCES.map(([k, l]) => `<option value="${k}">${escapeHtml(l)}</option>`).join('')}</select></div>
    <div class="field" id="personRow" style="display:none;"><label>Person</label><select name="userId"><option value="">Choose…</option>${people.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.role.replace(/_/g, ' ').toLowerCase())}</option>`).join('')}</select></div>
    <div class="field"><label>Title</label><input name="title" maxlength="150" required /></div>
    <div class="field"><label>Message</label><textarea name="message" rows="4" maxlength="500" required></textarea></div>
    <div class="field"><label>Importance</label><select name="type"><option value="INFO">Normal</option><option value="WARNING">Important</option><option value="SUCCESS">Good news</option><option value="ERROR">Urgent</option></select></div>
    <p class="text-muted" style="font-size:.8rem;">It appears in each person's notification bell straight away, and on their phone if they turned phone notifications on.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" type="submit">Send</button></div></form>`);
  const f = m.el.querySelector('#sendForm');
  f.audience.addEventListener('change', () => { m.el.querySelector('#personRow').style.display = f.audience.value === 'USER' ? '' : 'none'; f.userId.required = f.audience.value === 'USER'; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { await api.post('/notifications', Object.fromEntries(new FormData(f).entries())); toast('Notification sent.', 'success'); m.close(); load(); } catch { btn.disabled = false; }
  });
}

async function main() {
  await initPortalLayout({ portal: 'ALL', activeKey: 'notifications' });
  const profile = JSON.parse(sessionStorage.getItem('fugobs_profile') || '{}');
  const mayBroadcast = profile.role === 'OWNER' || profile.role === 'MANAGER' || (profile.permissions || {}).announcements === true;
  if (mayBroadcast) { qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="sendBtn">Send notification</button>'; qs('#sendBtn').addEventListener('click', openSend); }
  await load();
}
main();
