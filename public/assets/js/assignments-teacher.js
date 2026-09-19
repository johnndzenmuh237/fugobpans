import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { openFormModal } from './crud-table.js';
import { escapeHtml, formatDate, toast, qs } from './utils.js';

let myClasses = [];
let mySessions = [];

async function load() {
  const rows = await api.get('/assignments/mine');
  qs('#listMount').innerHTML = rows.length ? rows.map((a) => `
    <div class="card card-pad" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <strong>${escapeHtml(a.title)}</strong>
          <div class="text-muted" style="font-size:.82rem;">${escapeHtml(a.class_name)}${a.subject_name ? ` · ${escapeHtml(a.subject_name)}` : ''}${a.due_date ? ` · Due ${formatDate(a.due_date)}` : ''}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-outline" data-edit="${a.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-delete="${a.id}">Delete</button>
        </div>
      </div>
      ${a.description ? `<p style="margin-top:10px;">${escapeHtml(a.description)}</p>` : ''}
    </div>`).join('') : '<div class="empty-state">No assignments posted yet.</div>';

  qs('#listMount').querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this assignment?')) return;
    await api.del(`/assignments/${b.dataset.delete}`);
    toast('Assignment deleted.', 'success');
    load();
  }));
  qs('#listMount').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const a = rows.find((r) => r.id === b.dataset.edit);
    openFormModal({
      title: 'Edit Assignment',
      fields: [
        { name: 'title', label: 'Title', required: true, full: true },
        { name: 'description', label: 'Description', type: 'textarea', full: true },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
      ],
      initial: { title: a.title, description: a.description || '', dueDate: a.due_date ? a.due_date.slice(0, 10) : '' },
      submitLabel: 'Save Changes',
      onSubmit: async (v) => { await api.patch(`/assignments/${a.id}`, v); toast('Assignment updated.', 'success'); load(); },
    });
  }));
}

async function main() {
  await initPortalLayout({ portal: 'TEACHER', activeKey: 'assignments' });
  [myClasses, mySessions] = await Promise.all([api.get('/results/my-classes'), api.get('/academics/sessions')]);

  if (!myClasses.length) {
    qs('#pageRoot').innerHTML = '<div class="empty-state">You have not been assigned to any class yet — contact the Manager.</div>';
    return;
  }

  qs('#pageActions').innerHTML = `<button id="addBtn" class="btn btn-primary">Post Assignment</button>`;
  qs('#pageRoot').innerHTML = '<div id="listMount"></div>';
  await load();

  qs('#addBtn').addEventListener('click', async () => {
    // Subjects are optional and scoped to whichever class the teacher picks —
    // start with the first class's subjects as a sensible default list.
    const subjects = await api.get(`/results/my-subjects?classId=${myClasses[0].id}`).catch(() => []);
    openFormModal({
      title: 'Post a New Assignment',
      fields: [
        { name: 'classId', label: 'Class', type: 'select', required: true, options: myClasses.map((c) => ({ value: c.id, label: c.name })) },
        { name: 'subjectId', label: 'Subject (optional)', type: 'select', options: subjects.map((s) => ({ value: s.id, label: s.name })) },
        { name: 'academicSessionId', label: 'Academic Session', type: 'select', required: true, options: mySessions.map((s) => ({ value: s.id, label: s.name })) },
        { name: 'title', label: 'Title', required: true, full: true },
        { name: 'description', label: 'Description / Instructions', type: 'textarea', full: true },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
      ],
      onSubmit: async (v) => { await api.post('/assignments', v); toast('Assignment posted — visible to the class immediately.', 'success'); load(); },
    });
  });
}
main();
