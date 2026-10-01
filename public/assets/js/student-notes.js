import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatDateTime, escapeHtml, toast, qs } from './utils.js';

let students = [];

async function loadNotesFor(studentId) {
  const notes = await api.get(`/notes/student/${studentId}`);
  const mount = qs('#notesMount');
  if (!notes.length) { mount.innerHTML = '<p class="text-muted">No notes recorded for this student yet.</p>'; return; }
  mount.innerHTML = notes.map((n) => `
    <div class="card card-pad" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;">
        <span class="badge ${n.type === 'COMPLAINT' ? 'badge-danger' : n.type === 'COMMENDATION' ? 'badge-success' : 'badge-neutral'}">${n.type}</span>
        <span class="text-muted" style="font-size:.78rem;">${formatDateTime(n.created_at)}</span>
      </div>
      <p style="margin:8px 0 0;">${escapeHtml(n.note)}</p>
    </div>`).join('');
}

async function main() {
  await initPortalLayout({ portal: 'TEACHER', activeKey: 'student-notes' });

  const classes = await api.get('/results/my-classes');
  students = (await Promise.all(classes.map((c) => api.get(`/students?classId=${c.id}`).catch(() => [])))).flat();

  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="field"><label>Select Student</label>
        <select id="studentSelect">
          <option value="">Choose a student…</option>
          ${students.map((s) => `<option value="${s.id}">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)} — ${escapeHtml(s.class_name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <form id="noteForm" class="card card-pad" style="display:none;margin-bottom:18px;">
      <div class="field"><label>Type</label>
        <select name="type">
          <option value="GENERAL">General</option>
          <option value="BEHAVIOR">Behavior</option>
          <option value="COMPLAINT">Complaint</option>
          <option value="COMMENDATION">Commendation</option>
        </select>
      </div>
      <div class="field"><label>Note</label><textarea name="note" required rows="3" placeholder="What would you like the parent to know?"></textarea></div>
      <button type="submit" class="btn btn-primary">Save Note</button>
    </form>
    <h3>Previous Notes</h3>
    <div id="notesMount"><p class="text-muted">Select a student above to view their notes.</p></div>
  `;

  qs('#studentSelect').addEventListener('change', async (e) => {
    const studentId = e.target.value;
    qs('#noteForm').style.display = studentId ? 'block' : 'none';
    if (studentId) await loadNotesFor(studentId);
    else qs('#notesMount').innerHTML = '<p class="text-muted">Select a student above to view their notes.</p>';
  });

  qs('#noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = qs('#studentSelect').value;
    if (!studentId) return;
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api.post('/notes', { studentId, type: fd.type, note: fd.note });
      e.target.reset();
      await loadNotesFor(studentId);
      toast('Note saved.', 'success');
    } catch (err) {
      toast(err.message || 'Could not save note.', 'error');
    }
  });
}
main();
