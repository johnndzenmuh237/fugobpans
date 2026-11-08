import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, toast, today } from './ui.js';
import { MANAGEMENT_ROLES } from './auth.js';

const root = document.getElementById('pageRoot');
const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

(async () => {
  const isTeacherPage = location.pathname.startsWith('/teacher/');
  const profile = await initPortalLayout({ portal: isTeacherPage ? 'TEACHER' : 'MANAGER', activeKey: 'student-attendance' });
  const mgmt = MANAGEMENT_ROLES.includes(profile.role);
  const classes = mgmt ? await api.get('/academics/classes') : await api.get('/results/my-classes');
  root.innerHTML = `${mgmt ? '<h3>School-wide, for the chosen date</h3><div id="overview"></div><hr style="margin:20px 0;">' : ''}
    <div class="form-grid" style="max-width:560px;"><div class="field"><label>Class</label><select id="cls"><option value="">Select class…</option>${classes.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Date</label><input type="date" id="dt" value="${today()}" max="${today()}" /></div></div><div id="sheet"></div>`;
  const cls = root.querySelector('#cls'), dt = root.querySelector('#dt'), sheet = root.querySelector('#sheet');

  async function loadOverview() {
    if (!mgmt) return;
    const o = await api.get(`/student-attendance/overview?date=${dt.value}`);
    root.querySelector('#overview').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Enrolled</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th></tr></thead><tbody>${o.classes.map((c) => `<tr><td>${escapeHtml(c.class_name)}</td><td>${c.enrolled}</td><td>${c.present}</td><td>${c.late}</td><td>${c.absent}</td><td>${c.excused}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function loadSheet() {
    if (!cls.value) { sheet.innerHTML = ''; return; }
    const rows = await api.get(`/student-attendance/sheet?classId=${cls.value}&date=${dt.value}`);
    if (!rows.length) { sheet.innerHTML = '<div class="empty-state">No active students in this class.</div>'; return; }
    sheet.innerHTML = `<div style="display:flex;gap:8px;margin:12px 0;"><button class="btn btn-outline btn-sm" id="allPresent">Mark everyone present</button></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th>${STATUSES.map((s) => `<th>${s[0] + s.slice(1).toLowerCase()}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${r.student_id}"><td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)} <span class="text-muted">${escapeHtml(r.student_code)}</span></td>${STATUSES.map((s) => `<td><input type="radio" name="s_${r.student_id}" value="${s}" ${r.status === s ? 'checked' : ''} aria-label="${s}" /></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <button class="btn btn-primary" id="save" style="margin-top:12px;">Save attendance</button>`;
    sheet.querySelector('#allPresent').addEventListener('click', () => sheet.querySelectorAll('input[value=PRESENT]').forEach((i) => { i.checked = true; }));
    sheet.querySelector('#save').addEventListener('click', async () => {
      const records = [...sheet.querySelectorAll('tr[data-id]')].map((tr) => ({ studentId: tr.dataset.id, status: tr.querySelector('input:checked')?.value })).filter((r) => r.status);
      if (!records.length) return toast('Mark at least one student.', 'error');
      const r = await api.post('/student-attendance', { classId: cls.value, date: dt.value, records });
      toast(`Saved ${r.saved} record(s). ${r.absent} absent — parents have been notified.`, 'success'); loadOverview();
    });
  }
  cls.addEventListener('change', loadSheet); dt.addEventListener('change', () => { loadSheet(); loadOverview(); });
  loadOverview();
})();
