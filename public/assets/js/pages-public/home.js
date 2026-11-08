import { escapeHtml, formatDate } from '../utils.js';
import { listingCard } from './_cards.js';
const API = window.APP_CONFIG.API_BASE_URL;
const get = (p) => fetch(`${API}${p}`).then((r) => r.json());
(async () => {
  try {
    const listings = await get('/public/listings');
    document.getElementById('stats').innerHTML = [[listings.length, 'Properties listed'], [listings.filter((l) => l.kind === 'LAND').length, 'Lands'], [listings.reduce((s, l) => s + (l.vacant_units || 0), 0), 'Vacant homes'], [listings.filter((l) => l.construction_status === 'UNCOMPLETED').length, 'Under construction']].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    document.getElementById('featured').innerHTML = listings.length ? `<div class="prop-grid">${listings.slice(0, 6).map(listingCard).join('')}</div>` : '<p class="text-muted">New listings are coming soon.</p>';
  } catch { document.getElementById('featured').innerHTML = '<p class="text-muted">Listings are unavailable right now.</p>'; }
  try {
    const notices = await get('/announcements/public');
    document.getElementById('notices').innerHTML = notices.slice(0, 4).map((a) => `<div class="notice-card k-${a.kind}"><strong>${a.pinned ? '📌 ' : ''}${escapeHtml(a.title)}</strong><div style="margin:4px 0">${escapeHtml(a.body.slice(0, 160))}${a.body.length > 160 ? '…' : ''}</div><div class="text-muted" style="font-size:.76rem">${formatDate(a.created_at)}</div></div>`).join('') || '<p class="text-muted">No announcements right now.</p>';
  } catch { /* ignore */ }
})();
