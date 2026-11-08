import { escapeHtml } from '../utils.js';
const API = window.APP_CONFIG.API_BASE_URL;
document.addEventListener('site-ready', (e) => {
  const s = e.detail || {};
  document.getElementById('contactInfo').innerHTML = `<dl class="kv">${s.address ? `<dt>Address</dt><dd>${escapeHtml(s.address)}</dd>` : ''}${s.phone ? `<dt>Phone</dt><dd><a href="tel:${escapeHtml(s.phone)}">${escapeHtml(s.phone)}</a></dd>` : ''}${s.whatsapp ? `<dt>WhatsApp</dt><dd><a target="_blank" rel="noopener" href="https://wa.me/${String(s.whatsapp).replace(/\D/g, '')}">Chat with us</a></dd>` : ''}${s.email ? `<dt>Email</dt><dd><a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a></dd>` : ''}</dl>` || '';
});
document.getElementById('enquiryForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = document.getElementById('enqBtn'); btn.disabled = true;
  const r = await fetch(`${API}/public/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
  const d = await r.json(); const ok = document.getElementById('enqOk'); ok.classList.remove('hidden'); ok.textContent = r.ok ? d.message : (d.error || 'Could not send.');
  btn.disabled = false; if (r.ok) e.target.reset();
});
