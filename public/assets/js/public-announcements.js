const API = window.APP_CONFIG.API_BASE_URL;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

async function load() {
  const mount = document.getElementById('announcementsMount');
  try {
    const items = await fetch(`${API}/announcements/public`).then((r) => r.json());
    if (!items.length) {
      mount.innerHTML = '<p class="text-muted" style="text-align:center;">No announcements posted yet — check back soon.</p>';
      return;
    }
    mount.innerHTML = items.map((a) => `
      <div class="card card-pad" style="margin-bottom:16px;${a.pinned ? 'border-left:4px solid var(--accent, #6366f1);' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap;">
          <h3 style="margin:0;">${a.pinned ? '📌 ' : ''}${escapeHtml(a.title)}</h3>
          <span class="text-muted" style="font-size:.78rem;white-space:nowrap;">${formatDate(a.created_at)}</span>
        </div>
        <p style="white-space:pre-wrap;margin:10px 0 0;">${escapeHtml(a.body)}</p>
      </div>`).join('');
  } catch {
    mount.innerHTML = '<p class="text-muted" style="text-align:center;">Could not load announcements right now — please try again shortly.</p>';
  }
}
load();
