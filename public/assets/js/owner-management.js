import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { modal, showSecret, escapeHtml, fmtCell, toast, formatDateTime } from './ui.js';

const root = document.getElementById('pageRoot');
const ROLES = { PRINCIPAL: 'Principal', VICE_PRINCIPAL: 'Vice Principal', ADMINISTRATOR: 'School Administrator', ACADEMIC_ADMIN: 'Academic Administrator', MANAGER: 'Manager (full management access)' };
const PERMS = { students: 'Students & parents', teachers: 'Teachers, attendance & payroll staff', academics: 'Classes, subjects, timetable & result approval', finance: 'Fees, payments, expenses & payroll', announcements: 'Announcements', reports: 'Reports & audit log', registrations: 'New registrations' };
const PRESETS = {
  PRINCIPAL: ['students', 'teachers', 'academics', 'announcements', 'reports', 'registrations'],
  VICE_PRINCIPAL: ['students', 'academics', 'announcements', 'registrations'],
  ADMINISTRATOR: ['students', 'registrations', 'announcements'],
  ACADEMIC_ADMIN: ['academics', 'students', 'reports'],
  MANAGER: Object.keys(PERMS),
};
let departments = [];

const permBoxes = (selected) => `<div class="perm-grid">${Object.entries(PERMS).map(([k, l]) => `<label><input type="checkbox" name="perm_${k}" ${selected.includes(k) ? 'checked' : ''} /> ${escapeHtml(l)}</label>`).join('')}</div>`;
const readPerms = (form) => Object.fromEntries(Object.keys(PERMS).map((k) => [k, form.querySelector(`[name=perm_${k}]`).checked]));
const deptSelect = (sel) => `<select name="departmentId"><option value="">No department</option>${departments.map((d) => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select>`;

function accountForm({ title, account = null, replaceOf = null }) {
  const role = account?.role || 'PRINCIPAL';
  const isEdit = !!account, isReplace = !!replaceOf;
  const m = modal(title, `<form id="acctForm">
    ${isReplace ? `<p class="text-muted">The replacement takes over the post of <strong>${escapeHtml(replaceOf.name)}</strong> (same role, department and permissions). The old login is revoked immediately; all their past records and history stay intact.</p>` : ''}
    <div class="form-grid">
      <div class="field"><label>Full name</label><input name="name" required value="${escapeHtml(account?.name || '')}" /></div>
      <div class="field"><label>Email (login)</label><input name="email" type="email" required ${isEdit ? 'disabled' : ''} value="${escapeHtml(account?.email || '')}" /></div>
      <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(account?.phone || '')}" /></div>
      ${isReplace ? '' : `<div class="field"><label>Position</label><select name="role">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${k === role ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Job title / responsibilities</label><input name="jobTitle" value="${escapeHtml(account?.job_title || '')}" /></div>
      <div class="field"><label>Department</label>${deptSelect(account?.department_id)}</div>`}
      ${isEdit ? '' : '<div class="field form-row-full"><label>Initial password (optional)</label><input name="initialPassword" type="text" minlength="8" placeholder="Leave empty to generate a secure temporary password" /></div>'}
      ${isReplace ? '<div class="field form-row-full"><label>Reason for replacement</label><input name="reason" placeholder="e.g. Resigned, contract ended" /></div>' : ''}
    </div>
    ${isReplace ? '' : `<h4 style="margin-top:12px;">What this person may manage</h4><p class="text-muted" style="font-size:.82rem;">Defaults follow the position; adjust freely. The server enforces these on every request.</p>${permBoxes(account ? Object.keys(PERMS).filter((k) => account.permissions?.[k]) : PRESETS[role])}`}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" type="submit">${isReplace ? 'Replace' : isEdit ? 'Save changes' : 'Create account'}</button></div></form>`, { wide: true });
  const form = m.el.querySelector('#acctForm');
  m.el.querySelector('[data-close].btn-outline').addEventListener('click', m.close);
  form.querySelector('[name=role]')?.addEventListener('change', (e) => { if (!isEdit) Object.keys(PERMS).forEach((k) => { form.querySelector(`[name=perm_${k}]`).checked = PRESETS[e.target.value].includes(k); }); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    try {
      if (isReplace) {
        const r = await api.post(`/owner/management/${replaceOf.id}/replace`, { name: fd.name, email: fd.email, phone: fd.phone, reason: fd.reason, initialPassword: fd.initialPassword || undefined });
        m.close(); await load(); if (r.temporaryPassword) showSecret('Replacement created', `Give ${r.name} this temporary password for ${r.email}.`, r.temporaryPassword); else toast('Replacement created.', 'success');
      } else if (isEdit) {
        await api.patch(`/owner/management/${account.id}`, { name: fd.name, phone: fd.phone, jobTitle: fd.jobTitle, departmentId: fd.departmentId || undefined, role: fd.role, permissions: readPerms(form) });
        m.close(); toast('Saved.', 'success'); load();
      } else {
        const r = await api.post('/owner/management', { name: fd.name, email: fd.email, phone: fd.phone, role: fd.role, jobTitle: fd.jobTitle, departmentId: fd.departmentId || undefined, permissions: readPerms(form), initialPassword: fd.initialPassword || undefined });
        m.close(); await load(); if (r.temporaryPassword) showSecret('Account created', `Give ${r.name} this temporary password for ${r.email}.`, r.temporaryPassword); else toast('Account created.', 'success');
      }
    } catch { /* api already toasted */ }
  });
}

async function showHistory(a) {
  const h = await api.get(`/owner/management/${a.id}/history`);
  modal(`${a.name} — history`, `<h4>Posts held</h4><div class="table-wrap"><table><thead><tr><th>Position</th><th>Title</th><th>From</th><th>Until</th><th>Reason</th></tr></thead><tbody>
    ${h.assignments.map((x) => `<tr><td>${escapeHtml(ROLES[x.position] || x.position)}</td><td>${fmtCell('t', x.job_title)}</td><td>${fmtCell('starts_at', x.starts_at)}</td><td>${x.ends_at ? fmtCell('ends_at', x.ends_at) : 'Current'}</td><td>${fmtCell('r', x.end_reason)}</td></tr>`).join('') || '<tr><td colspan="5">No post history.</td></tr>'}</tbody></table></div>
    <h4 style="margin-top:14px;">Recorded activity (latest ${h.activity.length})</h4><div class="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Record</th></tr></thead><tbody>
    ${h.activity.map((x) => `<tr><td>${escapeHtml(formatDateTime(x.created_at))}</td><td>${escapeHtml(x.action.replace(/_/g, ' ').toLowerCase())}</td><td>${escapeHtml(x.entity || '')}</td></tr>`).join('') || '<tr><td colspan="3">No activity.</td></tr>'}</tbody></table></div>
    <p class="text-muted" style="font-size:.82rem;">These records stay permanently, even after the account is deactivated.</p>`, { wide: true });
}

async function load() {
  const rows = await api.get('/owner/management');
  root.querySelector('#acctTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Access</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody>
    ${rows.map((a) => `<tr><td><strong>${escapeHtml(a.name)}</strong><div class="text-muted" style="font-size:.78rem;">${escapeHtml(a.email)}</div></td><td>${escapeHtml(ROLES[a.role] || a.role)}${a.job_title ? `<div class="text-muted" style="font-size:.78rem;">${escapeHtml(a.job_title)}</div>` : ''}</td>
      <td>${escapeHtml(a.department_name || '—')}</td><td style="font-size:.78rem;max-width:220px;">${Object.keys(PERMS).filter((k) => a.permissions?.[k]).map((k) => PERMS[k].split(',')[0].split(' &')[0]).join(', ') || '—'}</td>
      <td><span class="badge ${a.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}">${escapeHtml(a.status)}</span>${a.deactivation_reason ? `<div class="text-muted" style="font-size:.75rem;">${escapeHtml(a.deactivation_reason)}</div>` : ''}</td>
      <td>${fmtCell('last_login_at', a.last_login_at)}</td>
      <td style="white-space:nowrap;">${a.status === 'ACTIVE'
        ? `<button class="btn btn-outline btn-sm" data-act="edit" data-id="${a.id}">Edit</button> <button class="btn btn-outline btn-sm" data-act="reset" data-id="${a.id}">Reset password</button> <button class="btn btn-outline btn-sm" data-act="replace" data-id="${a.id}">Replace</button> <button class="btn btn-danger btn-sm" data-act="deactivate" data-id="${a.id}">Deactivate</button>`
        : `<button class="btn btn-outline btn-sm" data-act="reactivate" data-id="${a.id}">Reactivate</button>`} <button class="btn btn-ghost btn-sm" data-act="history" data-id="${a.id}">History</button></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">No principals or administrators yet. Create the first one.</div></td></tr>'}</tbody></table></div>`;
  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const a = rows.find((x) => x.id === b.dataset.id);
    try {
      if (b.dataset.act === 'edit') accountForm({ title: `Edit ${a.name}`, account: a });
      else if (b.dataset.act === 'replace') accountForm({ title: `Replace ${a.name}`, replaceOf: a });
      else if (b.dataset.act === 'history') await showHistory(a);
      else if (b.dataset.act === 'reset') { if (confirm(`Reset the password for ${a.name}? Their current password stops working.`)) { const r = await api.post(`/owner/management/${a.id}/reset-password`, {}); showSecret('Password reset', `New temporary password for ${a.name}.`, r.temporaryPassword); } }
      else if (b.dataset.act === 'deactivate') { const reason = prompt(`Revoke ${a.name}'s access? Their records and history stay.\nReason (optional):`); if (reason !== null) { await api.post(`/owner/management/${a.id}/deactivate`, { reason }); toast('Access revoked.', 'success'); load(); } }
      else if (b.dataset.act === 'reactivate') { await api.post(`/owner/management/${a.id}/reactivate`, {}); toast('Access restored.', 'success'); load(); }
    } catch { /* toasted */ }
  }));
}

(async () => {
  await initPortalLayout({ portal: 'OWNER', activeKey: 'owner-management' });
  departments = await api.get('/employees/meta/departments').catch(() => []);
  root.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;"><p class="text-muted" style="max-width:640px;">Only you can create, change or revoke these accounts. A Principal can never create another owner, change your permissions or lock you out.</p><button class="btn btn-primary" id="newBtn">+ New principal / administrator</button></div><div id="acctTable" style="margin-top:12px;"><div class="spinner"></div></div>`;
  root.querySelector('#newBtn').addEventListener('click', () => accountForm({ title: 'New principal / administrator' }));
  load();
})();
