import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { qs } from './utils.js';

async function main() {
  const profile = await initPortalLayout({ portal: 'EMPLOYEE', activeKey: 'dashboard' });
  const me = await api.get('/employees/me');

  qs('#pageRoot').innerHTML = `
    <div class="welcome-banner"><h1>Welcome, ${profile.name}!</h1><p style="color:rgba(255,255,255,.85);margin:0;">${me.position_name || ''}</p></div>
    <div class="quick-actions">
      <a class="quick-action" href="/employee/attendance.html"><span class="icon">📅</span><span class="label">Mark Attendance</span></a>
      <a class="quick-action" href="/employee/profile.html"><span class="icon">👤</span><span class="label">My Profile</span></a>
    </div>`;
}
main();
