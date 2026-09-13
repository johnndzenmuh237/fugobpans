import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { qs } from './utils.js';

async function main() {
  const profile = await initPortalLayout({ portal: 'TEACHER', activeKey: 'dashboard' });
  const classes = await api.get('/results/my-classes');
  const totalStudents = classes.reduce((sum, c) => sum + Number(c.student_count), 0);

  qs('#pageRoot').innerHTML = `
    <div class="welcome-banner"><h1>Welcome, ${profile.name}!</h1><p style="color:rgba(255,255,255,.85);margin:0;">${classes.length} class(es) assigned · ${totalStudents} student(s) total</p></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Classes Assigned</div><div class="value">${classes.length}</div></div>
      <div class="stat-card"><div class="label">Total Students</div><div class="value">${totalStudents}</div></div>
    </div>
    <div class="quick-actions">
      <a class="quick-action" href="/teacher/results.html"><span class="icon">📝</span><span class="label">Upload Results</span></a>
      <a class="quick-action" href="/teacher/students.html"><span class="icon">👥</span><span class="label">My Students</span></a>
      <a class="quick-action" href="/teacher/attendance.html"><span class="icon">📅</span><span class="label">My Attendance</span></a>
      <a class="quick-action" href="/teacher/profile.html"><span class="icon">👤</span><span class="label">My Profile</span></a>
    </div>`;
}
main();
