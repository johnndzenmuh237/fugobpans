import { listingCard } from './_cards.js';
import { debounce } from '../utils.js';
const API = window.APP_CONFIG.API_BASE_URL;
const params = new URLSearchParams(location.search);
const state = { kind: params.get('kind') || '', purpose: params.get('purpose') || '', constructionStatus: params.get('constructionStatus') || '', city: '', q: params.get('q') || '' };
async function load() {
  const qs = new URLSearchParams(Object.entries(state).filter(([, v]) => v)).toString();
  const grid = document.getElementById('grid');
  try {
    const rows = await fetch(`${API}/public/listings${qs ? `?${qs}` : ''}`).then((r) => r.json());
    grid.innerHTML = rows.length ? `<p class="text-muted">${rows.length} result${rows.length === 1 ? '' : 's'}</p><div class="prop-grid">${rows.map(listingCard).join('')}</div>` : '<div class="empty-state card">No properties match. Try different filters — or <a href="/contact.html">tell us what you are looking for</a>.</div>';
  } catch { grid.innerHTML = '<p class="text-muted">Could not load listings.</p>'; }
}
const chips = document.querySelectorAll('#kindChips .chip');
const sync = () => chips.forEach((c) => c.classList.toggle('is-active', c.dataset.kind === state.kind));
chips.forEach((c) => c.addEventListener('click', () => { state.kind = c.dataset.kind; sync(); load(); }));
document.getElementById('fBuild').value = state.constructionStatus; document.getElementById('fPurpose').value = state.purpose; document.getElementById('fQ').value = state.q;
document.getElementById('fBuild').addEventListener('change', (e) => { state.constructionStatus = e.target.value; load(); });
document.getElementById('fPurpose').addEventListener('change', (e) => { state.purpose = e.target.value; load(); });
document.getElementById('fCity').addEventListener('input', debounce((e) => { state.city = e.target.value; load(); }));
document.getElementById('fQ').addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }));
sync(); load();
