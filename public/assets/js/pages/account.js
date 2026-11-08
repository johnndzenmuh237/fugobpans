import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { qs, toast } from '../utils.js';
async function main() {
  const profile = await initPortalLayout({ activeKey: 'account', title: 'My Account', subtitle: '' });
  const first = new URLSearchParams(location.search).get('first');
  qs('#pageRoot').innerHTML = `${first ? '<div class="notice-card k-PAYMENT"><strong>Please set your own password</strong><div>You signed in with a temporary password. Choose a new one to continue.</div></div>' : ''}
    <div class="card card-pad" style="max-width:480px"><dl class="kv" style="margin-bottom:18px"><dt>Name</dt><dd>${profile.name}</dd><dt>Email</dt><dd>${profile.email}</dd><dt>Role</dt><dd>${profile.role}</dd></dl>
    <form id="f"><div class="field"><label>Current password</label><input type="password" name="currentPassword" required/></div><div class="field"><label>New password (min 8 characters)</label><input type="password" name="newPassword" minlength="8" required/></div><button class="btn btn-primary" type="submit">Change password</button></form></div>`;
  qs('#f').addEventListener('submit', async (e) => { e.preventDefault(); await api.post('/auth/change-password', Object.fromEntries(new FormData(e.target).entries())); toast('Password changed.', 'success'); setTimeout(() => { location.href = '/admin/dashboard.html'; }, 800); });
}
main();
