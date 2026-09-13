import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { toast, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'settings' });
  const s = await api.get('/settings');

  qs('#pageRoot').innerHTML = `
    <form id="settingsForm" class="card card-pad" style="max-width:640px;">
      <div class="form-grid">
        <div class="field form-row-full"><label>School Name</label><input name="name" value="${s.name || ''}" required /></div>
        <div class="field form-row-full"><label>Motto</label><input name="motto" value="${s.motto || ''}" /></div>
        <div class="field form-row-full"><label>Address</label><input name="address" value="${s.address || ''}" /></div>
        <div class="field"><label>Phone</label><input name="phone" value="${s.phone || ''}" /></div>
        <div class="field"><label>WhatsApp</label><input name="whatsapp" value="${s.whatsapp || ''}" /></div>
        <div class="field"><label>Email</label><input name="email" value="${s.email || ''}" /></div>
        <div class="field"><label>Currency</label><input name="currency" value="${s.currency || 'FCFA'}" /></div>
        <div class="field"><label>Attendance Cutoff</label><input name="attendanceCutoff" type="time" value="${(s.attendance_cutoff || '09:00').slice(0, 5)}" /></div>
        <div class="field"><label>Registration Open</label><select name="registrationOpen"><option value="true" ${s.registration_open ? 'selected' : ''}>Yes</option><option value="false" ${!s.registration_open ? 'selected' : ''}>No</option></select></div>
      </div>
      <button type="submit" class="btn btn-primary">Save Settings</button>
    </form>`;

  qs('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    fd.registrationOpen = fd.registrationOpen === 'true';
    await api.patch('/settings', fd);
    toast('Settings saved.', 'success');
  });
}
main();
