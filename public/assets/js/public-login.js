import { login, homeFor } from './auth.js';
import { api } from './api.js';
import { toast } from './utils.js';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Logging in…';
  const fd = new FormData(e.target);
  try {
    await login(fd.get('email'), fd.get('password'));
  } catch (err) {
    
    btn.disabled = false;
    btn.textContent = 'Log In';
  }
});

// Opened from the installed app (or any time) while still signed in: go straight to the person's own dashboard.
(async () => {
  try {
    const res = await api.get('/auth/me', { quiet: true });
    if (res && res.role) location.replace(res.mustChangePassword ? '/change-password.html' : homeFor(res.role));
  } catch { /* not signed in: stay on the form */ }
})();
