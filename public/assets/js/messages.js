import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, tabBar, toast, formatDateTime } from './ui.js';

const root = document.getElementById('pageRoot');
const ROLE_LABEL = { OWNER: 'School Owner', MANAGER: 'Manager', PRINCIPAL: 'Principal', VICE_PRINCIPAL: 'Vice Principal', ADMINISTRATOR: 'Administrator', ACADEMIC_ADMIN: 'Academic Administrator', ACCOUNTANT: 'Accounts', TEACHER: 'Teacher', EMPLOYEE: 'Staff', STUDENT: 'Student', PARENT: 'Parent' };

async function boxTab(el, box) {
  const rows = await api.get(`/messages?box=${box}`);
  el.innerHTML = rows.length ? rows.map((m) => `<div class="card card-pad ${box === 'inbox' && !m.read_at ? 'notif-item unread' : ''}" style="margin-bottom:8px;cursor:pointer;" data-id="${m.id}">
    <div style="display:flex;justify-content:space-between;gap:8px;"><strong>${escapeHtml(m.subject)}</strong><span class="text-muted" style="font-size:.78rem;">${formatDateTime(m.created_at)}</span></div>
    <div class="text-muted" style="font-size:.82rem;">${box === 'inbox' ? `From ${escapeHtml(m.sender_name)} (${escapeHtml(ROLE_LABEL[m.sender_role] || m.sender_role)})` : `To ${escapeHtml(m.recipient_name)}`}</div>
    <div class="body" style="display:none;margin-top:8px;white-space:pre-wrap;">${escapeHtml(m.body)}</div></div>`).join('') : `<div class="empty-state">${box === 'inbox' ? 'Your inbox is empty.' : 'You have not sent any messages.'}</div>`;
  el.querySelectorAll('[data-id]').forEach((c) => c.addEventListener('click', async () => {
    const b = c.querySelector('.body'); b.style.display = b.style.display === 'none' ? 'block' : 'none';
    if (box === 'inbox' && c.classList.contains('unread')) { c.classList.remove('unread'); await api.patch(`/messages/${c.dataset.id}/read`, {}); }
  }));
}

async function composeTab(el, onSent) {
  const contacts = await api.get('/messages/contacts');
  const groups = {}; contacts.forEach((c) => { (groups[ROLE_LABEL[c.role] || c.role] ||= []).push(c); });
  el.innerHTML = contacts.length ? `<form id="cf" class="card card-pad" style="max-width:640px;"><div class="field"><label>To</label><select name="recipientId" required><option value="">Choose a recipient…</option>
    ${Object.entries(groups).map(([g, list]) => `<optgroup label="${escapeHtml(g)}">${list.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.job_title ? ` — ${escapeHtml(c.job_title)}` : ''}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="field"><label>Subject</label><input name="subject" maxlength="150" required /></div><div class="field"><label>Message</label><textarea name="body" rows="6" required></textarea></div>
    <button class="btn btn-primary" type="submit">Send</button></form>` : '<div class="empty-state">There is nobody you can message yet.</div>';
  el.querySelector('#cf')?.addEventListener('submit', async (e) => { e.preventDefault(); await api.post('/messages', Object.fromEntries(new FormData(e.target).entries())); toast('Message sent.', 'success'); onSent(); });
}

async function announcementsTab(el) {
  const rows = await api.get('/announcements/mine');
  el.innerHTML = rows.length ? rows.map((a) => `<div class="card card-pad" style="margin-bottom:8px;">${a.pinned ? '<span class="badge badge-warning">Pinned</span> ' : ''}<strong>${escapeHtml(a.title)}</strong><div class="text-muted" style="font-size:.78rem;">${formatDateTime(a.created_at)}</div><div style="margin-top:6px;white-space:pre-wrap;">${escapeHtml(a.body)}</div></div>`).join('') : '<div class="empty-state">No announcements right now.</div>';
}

(async () => {
  const profile = await initPortalLayout({ portal: 'ALL', activeKey: 'messages' });
  root.innerHTML = '<div id="tabs"></div><div id="body"></div>';
  const body = root.querySelector('#body'); let select;
  const tabs = [{ key: 'inbox', label: 'Inbox' }, { key: 'compose', label: 'New message' }, { key: 'sent', label: 'Sent' }, { key: 'announcements', label: 'Announcements' }];
  const go = (k) => { body.innerHTML = '<div class="spinner"></div>'; if (k === 'compose') composeTab(body, () => select('sent')); else if (k === 'announcements') announcementsTab(body); else boxTab(body, k); };
  select = (k) => { root.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === k)); go(k); };
  tabBar(root.querySelector('#tabs'), tabs, go, location.hash === '#announcements' ? 'announcements' : 'inbox');
})();
