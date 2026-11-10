(function () {
  const API = window.APP_CONFIG.API_BASE_URL;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (html, bad) => { $('msg').innerHTML = `<div class="card card-pad" style="${bad ? 'color:#c62828;' : ''}">${html}</div>`; };
  async function post(path, body) {
    const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  $('reqForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('reqBtn').disabled = true;
    try {
      const r = await post('/recovery/request', { phone: $('phone').value });
      say(esc(r.message), r.available === false);
      if (r.available !== false) { $('verForm').style.display = 'flex'; $('code').focus(); }
    } catch (err) { say(esc(err.message), true); } finally { $('reqBtn').disabled = false; }
  });
  $('verForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await post('/recovery/verify', { phone: $('phone').value, code: $('code').value.trim() });
      if (!r.children.length) return say('No students are registered under that number.', true);
      say(`<strong>Your tracking number${r.children.length > 1 ? 's' : ''}</strong>${r.children.map((c) => `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;"><div>${esc(c.name)} <span class="text-muted">(${esc(c.className)})</span></div><div style="font-size:1.4rem;font-weight:700;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">${esc(c.trackingCode || 'Not assigned yet — please contact the school')}</div></div>`).join('')}
        <p style="margin:12px 0 0;"><a class="btn btn-accent" href="/track-student.html">Open Student Dashboard</a></p>`);
      $('verForm').style.display = 'none';
    } catch (err) { say(esc(err.message), true); }
  });
})();
