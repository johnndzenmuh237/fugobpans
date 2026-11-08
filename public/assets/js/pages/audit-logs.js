import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable } from '../crud-table.js';
import { qs, escapeHtml, formatDateTime, debounce } from '../utils.js';
let table;
async function load() {
  const rows = await api.get(`/audit-logs${api.qs({ action: qs('#fA').value, user: qs('#fU').value })}`);
  const cols = [{ label: 'When', render: (l) => formatDateTime(l.created_at) }, { label: 'User', render: (l) => `${escapeHtml(l.user_name || '—')}<div class="text-muted" style="font-size:.74rem">${escapeHtml(l.user_role || '')}</div>` }, { label: 'Action', render: (l) => `<span class="mono" style="font-size:.78rem">${escapeHtml(l.action)}</span>` }, { label: 'Record', render: (l) => escapeHtml(l.entity) },
    { label: 'Details', render: (l) => `<span class="text-muted" style="font-size:.76rem;max-width:300px;display:inline-block;word-break:break-all">${escapeHtml(JSON.stringify(l.after_data || {}).slice(0, 140))}</span>` }, { label: 'IP', render: (l) => escapeHtml(l.ip || '') }];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { pageSize: 25, emptyMessage: 'No activity recorded.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'audit-logs', title: 'Audit Log', subtitle: 'Who did what and when. Entries cannot be edited or deleted.' });
  qs('#pageRoot').innerHTML = '<div class="filters-bar"><input id="fU" type="search" placeholder="Filter by user…"/><input id="fA" type="search" placeholder="Filter by action, e.g. CONFIRM_PAYMENT"/></div><div id="tableMount"></div>';
  ['#fU', '#fA'].forEach((s) => qs(s).addEventListener('input', debounce(load)));
  await load();
}
main();
