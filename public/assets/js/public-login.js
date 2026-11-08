import { login } from './auth.js';
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
