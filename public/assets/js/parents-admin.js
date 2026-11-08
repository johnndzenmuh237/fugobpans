import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, modal, showSecret, toast, fmtCell } from './ui.js';
import { debounce } from './utils.js';

const root = document.getElementById('pageRoot');
let students = [];

function newParentForm() {
  const m = modal('New parent / guardian account', `<form id="pf"><div class="form-grid">
    <div class="field"><label>Full name</label><input name="name" required /></div><div class="field"><label>Email (login)</label><input name="email" type="email" required /></div>
    <div class="field"><label>Phone</label><input name="phone" /></div><div class="field"><label>Relationship</label><input name="relationship" placeholder="Mother, Father, Guardian…" /></div>
    <div class="field form-row-full"><label>Children (hold Ctrl/Cmd to select several)</label><input id="stuFilter" placeholder="Filter students…" style="margin-bottom:6px;" />
      <select name="studentIds" id="stuSel" multiple size="7" required></select></div>
    <div class="field form-row-full"><label>Initial password (optional)</label><input name="password" minlength="8" placeholder="Leave empty to generate a secure temporary password" /></div></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" type="submit">Create account</button></div></form>`, { wide: true });
  const sel = m.el.querySelector('#stuSel');
  const fill = (q = '') => { const keep = new Set([...sel.selectedOptions].map((o) => o.value)); sel.innerHTML = students.filter((s) => `${s.first_name} ${s.last_name} ${s.student_code}`.toLowerCase().includes(q.toLowerCase())).map((s) => `<option value="${s.id}" ${keep.has(s.id) ? 'selected' : ''}>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)} — ${escapeHtml(s.class_name)} (${escapeHtml(s.student_code)})</option>`).join(''); };
  fill(); m.el.querySelector('#stuFilter').addEventListener('input', debounce((e) => fill(e.target.value), 200));
  m.el.querySelector('[data-close].btn-outline').addEventListener('click', m.close);
  m.el.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const r = await api.post('/parents', { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), relationship: fd.get('relationship'), password: fd.get('password') || undefined, studentIds: [...sel.selectedOptions].map((o) => o.value) });
    m.close(); load(); if (r.temporaryPassword) showSecret('Parent account created', `Give ${r.name} this temporary password for ${r.email}.`, r.temporaryPassword); else toast('Parent account created.', 'success');
  });
}

async function load() {
  const rows = await api.get('/parents');
  root.querySelector('#list').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Parent</th><th>Children</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="text-muted" style="font-size:.78rem;">${escapeHtml(p.email)}${p.phone ? ` · ${escapeHtml(p.phone)}` : ''}</div></td>
    <td>${p.children.map((c) => `<span class="badge badge-info" style="margin:2px;">${escapeHtml(c.name)} <a href="#" data-unlink="${p.id}|${c.id}" title="Unlink" style="margin-left:4px;">&times;</a></span>`).join('') || '—'}</td>
    <td>${escapeHtml(p.status)}</td><td>${fmtCell('last_login_at', p.last_login_at)}</td><td><button class="btn btn-outline btn-sm" data-link="${p.id}">Link another child</button></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">No parent accounts yet.</div></td></tr>'}</tbody></table></div>`;
  root.querySelectorAll('[data-unlink]').forEach((a) => a.addEventListener('click', async (e) => { e.preventDefault(); const [pid, sid] = a.dataset.unlink.split('|'); if (confirm('Unlink this child from the parent?')) { await api.del(`/parents/${pid}/children/${sid}`); load(); } }));
  root.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => {
    const m = modal('Link a child', `<form id="lf"><div class="field"><label>Student</label><select name="studentId" required><option value="">Select…</option>${students.map((s) => `<option value="${s.id}">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)} — ${escapeHtml(s.class_name)}</option>`).join('')}</select></div><button class="btn btn-primary" type="submit">Link</button></form>`);
    m.el.querySelector('#lf').addEventListener('submit', async (e) => { e.preventDefault(); await api.post(`/parents/${b.dataset.link}/children`, { studentId: new FormData(e.target).get('studentId') }); m.close(); load(); });
  }));
}

(async () => {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'parents' });
  students = await api.get('/students');
  root.innerHTML = '<div style="margin-bottom:12px;"><button class="btn btn-primary" id="newBtn">+ New parent account</button></div><div id="list"><div class="spinner"></div></div>';
  root.querySelector('#newBtn').addEventListener('click', newParentForm);
  load();
})();
