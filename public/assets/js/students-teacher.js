import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { statusBadge, escapeHtml, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'TEACHER', activeKey: 'students' });
  const classes = await api.get('/results/my-classes');
  const allStudents = (await Promise.all(classes.map((c) => api.get(`/students?classId=${c.id}`).catch(() => [])))).flat();

  qs('#pageRoot').innerHTML = `<p class="text-muted">${allStudents.length} student(s) across your ${classes.length} assigned class(es).</p><div id="tableMount"></div>`;
  renderTable(qs('#tableMount'), allStudents, [
    { key: 'name', label: 'Name', render: (r) => `${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}` },
    { key: 'student_code', label: 'ID', render: (r) => `<span class="mono">${r.student_code}</span>` },
    { key: 'class_name', label: 'Class' },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
  ], { emptyMessage: 'No students in your assigned classes yet.' });
}
main();
