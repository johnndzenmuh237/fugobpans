import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'TEACHER', activeKey: 'classes' });
  const classes = await api.get('/results/my-classes');

  qs('#pageRoot').innerHTML = classes.length ? `<div class="card-grid">${classes.map((c) => `
    <div class="feature-card">
      <div class="icon-badge">🏫</div>
      <h3>${escapeHtml(c.name)}</h3>
      <p class="text-muted">${escapeHtml(c.category_name)}</p>
      <p><strong>${c.student_count}</strong> student(s) registered</p>
      <a class="btn btn-outline btn-sm" href="/teacher/students.html">View Students</a>
    </div>`).join('')}</div>` : '<div class="empty-state">No classes assigned yet — contact the Manager.</div>';
}
main();
