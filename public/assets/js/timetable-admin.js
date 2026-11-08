import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, tabBar, toast, modal, fmtCell } from './ui.js';
import { renderSchedule } from './schedule-view.js';

const root = document.getElementById('pageRoot');
const opts = (list, label = (x) => x.name) => list.map((x) => `<option value="${x.id}">${escapeHtml(label(x))}</option>`).join('');

async function timetableTab(box) {
  const [classes, subjects, sessions, employees] = await Promise.all([api.get('/academics/classes'), api.get('/academics/subjects'), api.get('/academics/sessions'), api.get('/employees').catch(() => [])]);
  box.innerHTML = `<div class="form-grid" style="max-width:640px;"><div class="field"><label>Class</label><select id="cls"><option value="">Select class…</option>${opts(classes)}</select></div></div>
    <div id="grid"></div><div id="addBox"></div>`;
  const cls = box.querySelector('#cls');
  async function draw() {
    if (!cls.value) { box.querySelector('#grid').innerHTML = ''; box.querySelector('#addBox').innerHTML = ''; return; }
    const slots = await api.get(`/timetable?classId=${cls.value}`);
    box.querySelector('#grid').innerHTML = `<div style="margin:12px 0;">${renderSchedule(slots)}</div>${slots.length ? `<details><summary>Remove a lesson</summary>${slots.map((s) => `<div style="display:flex;gap:8px;padding:4px 0;"><span style="flex:1;font-size:.85rem;">${['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][s.weekday]} ${s.start_time} · ${escapeHtml(s.subject_name)}</span><button class="btn btn-danger btn-sm" data-del="${s.id}">Delete</button></div>`).join('')}</details>` : ''}`;
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Delete this lesson?')) { await api.del(`/timetable/${b.dataset.del}`); draw(); } }));
    box.querySelector('#addBox').innerHTML = `<h3 style="margin-top:16px;">Add a lesson</h3><form id="slotForm" class="form-grid" style="max-width:760px;">
      <div class="field"><label>Subject</label><select name="subjectId" required><option value="">Select…</option>${opts(subjects)}</select></div>
      <div class="field"><label>Teacher</label><select name="teacherEmployeeId"><option value="">Unassigned</option>${opts(employees, (e) => `${e.first_name} ${e.last_name}`)}</select></div>
      <div class="field"><label>Day</label><select name="weekday">${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => `<option value="${i + 1}">${d}</option>`).join('')}</select></div>
      <div class="field"><label>Session</label><select name="academicSessionId" required>${opts(sessions)}</select></div>
      <div class="field"><label>Starts</label><input type="time" name="startTime" required /></div><div class="field"><label>Ends</label><input type="time" name="endTime" required /></div>
      <div class="field"><label>Room</label><input name="room" /></div><div class="field" style="align-self:end;"><button class="btn btn-primary" type="submit">Add lesson</button></div></form>`;
    box.querySelector('#slotForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries());
      await api.post('/timetable', { ...fd, classId: cls.value, weekday: Number(fd.weekday), teacherEmployeeId: fd.teacherEmployeeId || undefined });
      toast('Lesson added.', 'success'); draw();
    });
  }
  cls.addEventListener('change', draw);
}

async function termsTab(box) {
  const [terms, sessions] = await Promise.all([api.get('/terms'), api.get('/academics/sessions')]);
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Session</th><th>Term</th><th>Starts</th><th>Ends</th><th>Status</th></tr></thead><tbody>${terms.map((t) => `<tr><td>${escapeHtml(t.session_name)}</td><td>${escapeHtml(t.name)}</td><td>${fmtCell('start_date', t.start_date)}</td><td>${fmtCell('end_date', t.end_date)}</td><td>${escapeHtml(t.status)}</td></tr>`).join('') || '<tr><td colspan="5">No terms yet.</td></tr>'}</tbody></table></div>
    <h3 style="margin-top:16px;">Add or update a term</h3><form id="termForm" class="form-grid" style="max-width:760px;">
    <div class="field"><label>Session</label><select name="academicSessionId" required>${opts(sessions)}</select></div><div class="field"><label>Name</label><input name="name" placeholder="Term 1 / Semester 2" required /></div>
    <div class="field"><label>Starts</label><input type="date" name="startDate" /></div><div class="field"><label>Ends</label><input type="date" name="endDate" /></div>
    <div class="field"><label>Status</label><select name="status"><option>ACTIVE</option><option>CLOSED</option></select></div><div class="field" style="align-self:end;"><button class="btn btn-primary" type="submit">Save term</button></div></form>
    <p class="text-muted" style="font-size:.82rem;">Examination marks use whatever term/sequence names your teachers enter. Defining terms here keeps the academic calendar on record.</p>`;
  box.querySelector('#termForm').addEventListener('submit', async (e) => { e.preventDefault(); await api.post('/terms', Object.fromEntries(new FormData(e.target).entries())); toast('Saved.', 'success'); termsTab(box); });
}

(async () => {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'timetable' });
  root.innerHTML = '<div id="tabs"></div><div id="tabBody"></div>';
  tabBar(root.querySelector('#tabs'), [{ key: 't', label: 'Class timetable' }, { key: 'terms', label: 'Terms & semesters' }], (k) => (k === 't' ? timetableTab : termsTab)(root.querySelector('#tabBody')));
})();
