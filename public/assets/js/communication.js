/**
 * One page, four private views, chosen by who is signed in (the server enforces the same rules):
 *   staff (teacher/employee/accountant)  -> "Message Management": their own threads with management
 *   manager / principal / admin          -> "Staff Messages" inbox (if allowed) + "Message the Owner" (their own threads)
 *   owner                                -> "Manager Messages" inbox + "Staff Messages" inbox
 */
import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, toast, formatDateTime } from './utils.js';

const STAFF = ['TEACHER', 'EMPLOYEE', 'ACCOUNTANT'];
const ROLE_LABEL = { OWNER: 'School Owner', MANAGER: 'Manager', PRINCIPAL: 'Principal', VICE_PRINCIPAL: 'Vice Principal', ADMINISTRATOR: 'Administrator', ACADEMIC_ADMIN: 'Academic Administrator', ACCOUNTANT: 'Accountant', TEACHER: 'Teacher', EMPLOYEE: 'Staff' };
const CAT = { MESSAGE: 'Message', REQUEST: 'Request', QUESTION: 'Question', COMPLAINT: 'Complaint' };
const root = document.getElementById('pageRoot');
let me; let view; let activeId = null; let pollTimer = null;

function views(profile) {
  const r = profile.role; const perms = profile.permissions || {};
  const canStaffInbox = r === 'OWNER' || r === 'MANAGER' || perms.teachers === true;
  const out = [];
  if (STAFF.includes(r)) out.push({ key: 'staff', title: 'Message Management', sub: 'Write to school management: messages, requests, questions or complaints. Only you and authorised managers can read these.', mode: 'mine', channel: 'STAFF_MANAGEMENT', newLabel: 'New message to management', who: 'Management' });
  if (canStaffInbox) out.push({ key: 'staff', title: 'Staff Messages', sub: 'Private messages from staff members. Reply to continue the conversation.', mode: 'inbox', channel: 'STAFF_MANAGEMENT' });
  if (r === 'OWNER') out.push({ key: 'owner', title: 'Manager Messages', sub: 'Private messages from principals and managers.', mode: 'inbox', channel: 'MANAGER_OWNER' });
  else if (!STAFF.includes(r)) out.push({ key: 'owner', title: 'Message the Owner', sub: 'Private line to the school owner. Other managers cannot see these conversations.', mode: 'mine', channel: 'MANAGER_OWNER', newLabel: 'New message to the Owner', who: 'School Owner' });
  return out;
}

function threadHtml(c) {
  return c.messages.map((m) => {
    const mine = m.sender_id === me.id || m.sender_id === me.uid;
    return `<div class="bubble ${mine ? 'me' : ''}"><div class="meta"><strong>${escapeHtml(mine ? 'You' : m.sender_name)}</strong> · ${escapeHtml(ROLE_LABEL[m.sender_role] || m.sender_role)} · ${escapeHtml(formatDateTime(m.created_at))}</div>${escapeHtml(m.body)}</div>`;
  }).join('');
}

async function openThread(id, mount, reloadList) {
  activeId = id;
  mount.innerHTML = '<div class="spinner"></div>';
  let c;
  try { c = await api.get(`/conversations/${id}`); } catch { mount.innerHTML = '<div class="empty-state">Conversation not found.</div>'; return; }
  const responder = c.side === 'responder';
  mount.innerHTML = `<div class="card card-pad">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div><h3 style="margin:0;">${escapeHtml(c.subject)} <span class="pill ${c.category}">${CAT[c.category]}</span> ${c.status === 'CLOSED' ? '<span class="pill">Closed</span>' : ''}</h3>
      <div class="text-muted" style="font-size:.82rem;">${responder ? `From <strong>${escapeHtml(c.participant_name)}</strong> · ${escapeHtml(ROLE_LABEL[c.participant_role] || c.participant_role)}${c.participant_title ? ` · ${escapeHtml(c.participant_title)}` : ''}${c.employee_code ? ` · <span class="mono">${escapeHtml(c.employee_code)}</span>` : ''}` : 'Private conversation'} · started ${escapeHtml(formatDateTime(c.created_at))}</div></div>
      ${responder ? `<button class="btn btn-outline btn-sm" id="toggleStatus">${c.status === 'OPEN' ? 'Close conversation' : 'Re-open'}</button>` : ''}
    </div>
    <div class="conv-thread" id="thread" style="margin:14px 0;">${threadHtml(c)}</div>
    ${responder && c.status === 'CLOSED' ? '<p class="text-muted">This conversation is closed. Re-open it to reply.</p>' : `<form id="replyForm"><div class="field"><textarea name="body" rows="3" maxlength="5000" placeholder="Write a reply…" required></textarea></div><button class="btn btn-primary" type="submit">Send reply</button></form>`}
  </div>`;
  const t = mount.querySelector('#thread'); t.scrollTop = t.scrollHeight;
  mount.querySelector('#replyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api.post(`/conversations/${id}/messages`, { body: e.target.body.value }); toast('Sent.', 'success'); await reloadList(); await openThread(id, mount, reloadList); } catch { btn.disabled = false; }
  });
  mount.querySelector('#toggleStatus')?.addEventListener('click', async () => { await api.patch(`/conversations/${id}/status`, { status: c.status === 'OPEN' ? 'CLOSED' : 'OPEN' }); await reloadList(); openThread(id, mount, reloadList); });
}

function composeForm(v, onDone) {
  return `<form id="newForm" class="card card-pad" style="max-width:680px;margin-bottom:16px;">
    <h3 style="margin-top:0;">${escapeHtml(v.newLabel)}</h3>
    <div class="form-grid"><div class="field"><label>Type</label><select name="category">${Object.entries(CAT).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field"><label>Subject</label><input name="subject" maxlength="150" required /></div></div>
    <div class="field"><label>Message</label><textarea name="body" rows="5" maxlength="5000" required></textarea></div>
    <div style="display:flex;gap:8px;"><button class="btn btn-primary" type="submit">Send to ${escapeHtml(v.who)}</button><button type="button" class="btn btn-outline" id="cancelNew">Cancel</button></div></form>`;
}

async function render() {
  document.getElementById('pageTitle').textContent = view.title;
  document.getElementById('pageSub').textContent = view.sub;
  document.title = `${view.title} | FUGOBPANS`;
  root.innerHTML = `<div id="composeMount"></div><div class="conv-layout"><div><input id="filter" type="search" placeholder="Search name or subject…" style="width:100%;margin-bottom:8px;" /><div class="conv-list" id="list"></div></div><div id="threadMount"><div class="empty-state">Select a conversation.</div></div></div>`;
  const list = root.querySelector('#list'); const tm = root.querySelector('#threadMount'); const filter = root.querySelector('#filter');
  let rows = [];
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const shown = rows.filter((r) => !q || `${r.participant_name} ${r.subject}`.toLowerCase().includes(q));
    list.innerHTML = shown.length ? shown.map((r) => `<button type="button" class="conv-item ${r.unread ? 'unread' : ''} ${r.id === activeId ? 'is-active' : ''}" data-id="${r.id}">
      <div class="row"><strong>${view.mode === 'inbox' ? escapeHtml(r.participant_name) : escapeHtml(r.subject)}</strong><span class="text-muted" style="font-size:.72rem;white-space:nowrap;">${escapeHtml(formatDateTime(r.last_message_at))}</span></div>
      <div class="sub">${view.mode === 'inbox' ? `${escapeHtml(ROLE_LABEL[r.participant_role] || r.participant_role)}${r.participant_title ? ` · ${escapeHtml(r.participant_title)}` : ''} — ` : ''}${view.mode === 'inbox' ? escapeHtml(r.subject) : escapeHtml(r.preview || '')}</div>
      <div class="sub">${r.unread ? '<strong style="color:#dc2626;">● Unread</strong> · ' : ''}<span class="pill ${r.category}">${CAT[r.category]}</span>${r.status === 'CLOSED' ? '<span class="pill">Closed</span>' : ''} · ${r.message_count} message${r.message_count === 1 ? '' : 's'}</div></button>`).join('')
      : `<div class="empty-state">${view.mode === 'inbox' ? 'No messages yet.' : 'You have not written to ' + escapeHtml(view.who) + ' yet.'}</div>`;
    list.querySelectorAll('.conv-item').forEach((b) => b.addEventListener('click', async () => { await openThread(b.dataset.id, tm, loadList); await loadList(); tm.scrollIntoView?.({ block: 'nearest' }); }));
  };
  const loadList = async () => { rows = await api.get(`/conversations/${view.mode}?channel=${view.channel}`); draw(); };
  filter.addEventListener('input', draw);
  if (view.mode === 'mine') {
    const actions = document.getElementById('pageActions');
    actions.innerHTML = `<button class="btn btn-primary" id="newBtn">${escapeHtml(view.newLabel)}</button>`;
    actions.querySelector('#newBtn').onclick = () => {
      const cm = root.querySelector('#composeMount'); cm.innerHTML = composeForm(view);
      cm.querySelector('#cancelNew').onclick = () => { cm.innerHTML = ''; };
      cm.querySelector('#newForm').addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
        try { const r = await api.post('/conversations', { channel: view.channel, ...Object.fromEntries(new FormData(e.target).entries()) }); toast('Message sent.', 'success'); cm.innerHTML = ''; await loadList(); openThread(r.id, tm, loadList); } catch { btn.disabled = false; }
      });
    };
  } else document.getElementById('pageActions').innerHTML = '';
  await loadList();
  clearInterval(pollTimer); pollTimer = setInterval(() => { if (!document.hidden) loadList().catch(() => {}); }, 30000);
  const want = new URLSearchParams(location.search).get('c');
  if (want && rows.some((r) => r.id === want)) { await openThread(want, tm, loadList); await loadList(); }
}

(async () => {
  me = await initPortalLayout({ portal: 'ALL', activeKey: 'comm' });
  const all = views(me);
  const ch = new URLSearchParams(location.search).get('channel');
  if (!all.length) { root.innerHTML = '<div class="empty-state">This section is not available for your account.</div>'; return; }
  // Highlight the right sidebar link for the view in use.
  const setActive = () => { const key = view.key === 'staff' ? 'comm-staff' : (me.role === 'OWNER' ? 'owner-inbox' : 'comm-owner'); document.querySelectorAll('#sidebarNav .nav-link').forEach((a) => a.classList.toggle('is-active', a.dataset.key === key)); };
  if (all.length > 1) {
    const bar = document.createElement('div'); bar.className = 'tab-bar'; bar.style.marginBottom = '12px';
    bar.innerHTML = all.map((v, i) => `<button type="button" data-i="${i}">${escapeHtml(v.title)}</button>`).join('');
    root.before(bar);
    const pick = (i) => { view = all[i]; activeId = null; bar.querySelectorAll('button').forEach((b, j) => b.classList.toggle('is-active', i === j)); setActive(); render(); };
    bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.i))));
    pick(Math.max(0, all.findIndex((v) => v.key === ch)));
  } else { view = all[0]; setActive(); render(); }
})();
