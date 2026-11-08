import { api } from './api.js';
import { login, homeFor, currentProfile, requireRole } from './auth.js';
import { toast } from './utils.js';

const $ = (id) => document.getElementById(id);
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = on ? 'Please wait…' : label; };

// ---- Owner login: only an OWNER account may use this page
$('ownerLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('submitBtn'); busy(btn, true, 'Log In');
  const fd = new FormData(e.target);
  try {
    const profile = await api.post('/auth/login', { email: fd.get('email'), password: fd.get('password') });
    if (profile.role !== 'OWNER') {
      await api.post('/auth/logout', {});
      toast('This page is only for the School Owner. Use the main login page.', 'error');
      busy(btn, false, 'Log In'); return;
    }
    sessionStorage.setItem('fugobs_profile', JSON.stringify(profile));
    window.location.href = profile.mustChangePassword ? '/change-password.html' : homeFor('OWNER');
  } catch { busy(btn, false, 'Log In'); }
});

// ---- Forgot password (the server answers identically whether or not the email exists)
$('forgotForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('submitBtn'); busy(btn, true, 'Send reset link');
  try {
    const r = await api.post('/auth/forgot-password', { email: new FormData(e.target).get('email') });
    const m = $('doneMsg'); m.textContent = r.message; m.style.display = 'block';
  } catch {} finally { busy(btn, false, 'Send reset link'); }
});

// ---- Reset password via emailed token
$('resetForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get('newPassword') !== fd.get('confirm')) return toast('The two passwords do not match.', 'error');
  const token = new URLSearchParams(location.search).get('token');
  if (!token) return toast('This reset link is incomplete. Request a new one.', 'error');
  const btn = $('submitBtn'); busy(btn, true, 'Save new password');
  try { await api.post('/auth/reset-password', { token, newPassword: fd.get('newPassword') }); toast('Password updated. You can log in now.', 'success'); setTimeout(() => { location.href = '/login.html'; }, 1200); }
  catch { busy(btn, false, 'Save new password'); }
});

// ---- Change password (also the forced first-login screen)
if ($('changeForm')) {
  (async () => {
    const profile = await requireRole(null);
    if (profile.mustChangePassword) { $('currentField').style.display = 'none'; $('changeNote').textContent = 'You are using a temporary password. Please choose your own before continuing.'; $('backLink').style.display = 'none'; }
    $('backLink').addEventListener('click', (e) => { e.preventDefault(); history.length > 1 ? history.back() : (location.href = homeFor(profile.role)); });
    $('changeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (fd.get('newPassword') !== fd.get('confirm')) return toast('The two passwords do not match.', 'error');
      const btn = $('submitBtn'); busy(btn, true, 'Update password');
      try { await api.post('/auth/change-password', { currentPassword: fd.get('currentPassword') || undefined, newPassword: fd.get('newPassword') }); toast('Password updated.', 'success'); setTimeout(() => { location.href = homeFor(profile.role); }, 900); }
      catch { busy(btn, false, 'Update password'); }
    });
  })();
}
