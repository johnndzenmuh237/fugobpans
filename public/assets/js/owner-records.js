import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, fmtCell, tabBar } from './ui.js';
import { debounce } from './utils.js';

const TYPES = [['students', 'Students'], ['teachers', 'Teachers'], ['employees', 'All employees'], ['classes', 'Classes'], ['departments', 'Departments'], ['administrators', 'Administrators'], ['parents', 'Parents'],
  ['registrations', 'Registrations'], ['invoices', 'Invoices'], ['outstanding', 'Outstanding fees'], ['payments', 'Payments'], ['expenses', 'Expenses'], ['results', 'Exam results'], ['attendance', 'Student attendance'], ['activity', 'Activity log']];
const root = document.getElementById('pageRoot');
let type = new URLSearchParams(location.search).get('type') || 'students', q = '', offset = 0;
const LIMIT = 50;

async function load() {
  const out = root.querySelector('#recOut');
  out.innerHTML = '<div class="spinner"></div>';
  const r = await api.get(`/owner/records/${type}?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${offset}`);
  const pages = Math.max(1, Math.ceil(r.total / LIMIT)), page = Math.floor(offset / LIMIT) + 1;
  out.innerHTML = `<div class="table-wrap"><table><thead><tr>${r.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}${r.link ? '<th></th>' : ''}</tr></thead><tbody>
    ${r.rows.map((row) => `<tr>${r.columns.map((c) => `<td>${fmtCell(c.key, row[c.key])}</td>`).join('')}${r.link ? `<td><a href="${r.link}${row[r.linkField]}">Open</a></td>` : ''}</tr>`).join('') || `<tr><td colspan="${r.columns.length + 1}"><div class="empty-state">No records found.</div></td></tr>`}
    </tbody></table></div>
    <div class="pagination"><button id="prev" ${page <= 1 ? 'disabled' : ''}>&lsaquo;</button><span class="text-muted" style="padding:0 8px;font-size:.82rem;">Page ${page} of ${pages} · ${r.total} record${r.total === 1 ? '' : 's'}</span><button id="next" ${page >= pages ? 'disabled' : ''}>&rsaquo;</button></div>`;
  out.querySelector('#prev')?.addEventListener('click', () => { offset -= LIMIT; load(); });
  out.querySelector('#next')?.addEventListener('click', () => { offset += LIMIT; load(); });
}

(async () => {
  await initPortalLayout({ portal: 'OWNER', activeKey: 'owner-records' });
  if (!TYPES.some(([k]) => k === type)) type = 'students';
  root.innerHTML = `<div id="recTabs"></div><div class="field" style="max-width:360px;"><input id="recSearch" type="search" placeholder="Search these records…" /></div><div id="recOut"></div>`;
  root.querySelector('#recSearch').addEventListener('input', debounce((e) => { q = e.target.value.trim(); offset = 0; load(); }, 350));
  tabBar(root.querySelector('#recTabs'), TYPES.map(([key, label]) => ({ key, label })), (k) => { type = k; offset = 0; q = ''; root.querySelector('#recSearch').value = ''; history.replaceState(null, '', `?type=${k}`); load(); }, type);
})();
