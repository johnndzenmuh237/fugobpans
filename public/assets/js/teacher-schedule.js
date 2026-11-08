import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderSchedule } from './schedule-view.js';
(async () => {
  await initPortalLayout({ portal: 'TEACHER', activeKey: 'schedule' });
  document.getElementById('pageRoot').innerHTML = renderSchedule(await api.get('/timetable/my'), { showClass: true, showTeacher: false });
})();
