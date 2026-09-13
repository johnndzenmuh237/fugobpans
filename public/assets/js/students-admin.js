import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { statusBadge, debounce, qs, escapeHtml } from './utils.js';

async function load() {
  const q = qs('#q')?.value || '';
  const rows = await api.get(`/students${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderTable(qs('#tableMount'), rows, [
    { key: 'name', label: 'Name', render: (r) => `<a href="/admin/student-profile.html?id=${r.id}">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</a>` },
    { key: 'student_code', label: 'ID', render: (r) => `<span class="mono">${r.student_code}</span>` },
    { key: 'category_name', label: 'Category' },
    { key: 'class_name', label: 'Class' },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
  ]);
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'students' });
  qs('#pageRoot').innerHTML = `<div class="filters-bar"><div class="search-input-wrap"><input type="search" id="q" placeholder="Search name or ID…" /></div></div><div id="tableMount"></div>`;
  await load();
  qs('#q').addEventListener('input', debounce(load, 250));
}
main();
