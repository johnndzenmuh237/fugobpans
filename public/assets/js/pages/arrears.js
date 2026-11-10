import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, opts } from '../utils.js';
import { lookups, selectHtml, card } from './_common.js';

async function load(propertyId) {
  const rows = await api.get(`/finance/arrears${api.qs({ propertyId })}`);
  const total = rows.reduce((s, r) => s + r.amount_owing, 0);
  qs('#cards').innerHTML = `<div class="stat-grid">${card('Tenants owing', rows.length)}${card('Total outstanding', formatCurrency(total), { cls: total ? 'warn' : '' })}${card('3+ months behind', rows.filter((r) => r.months_owing >= 3).length, { cls: 'warn' })}</div>`;
  renderTable(qs('#tableMount'), rows, [
    { label: 'Tenant', render: (r) => `<a href="/admin/tenant-profile.html?id=${r.tenant_id}"><strong>${escapeHtml(r.tenant_name)}</strong></a><div><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a></div>` },
    { label: 'Unit', render: (r) => `${escapeHtml(r.property_name)}<div class="text-muted" style="font-size:.78rem">House ${escapeHtml(r.house_no)} · Unit ${escapeHtml(r.unit_no)}</div>` },
    { label: 'Months owing', render: (r) => r.months_owing }, { label: 'Amount owing', render: (r) => `<strong style="color:var(--danger-600)">${formatCurrency(r.amount_owing)}</strong>` },
    { label: 'Oldest unpaid due', render: (r) => formatDate(r.next_payment_date) }, { label: 'Days overdue', render: (r) => r.days_overdue }, { label: 'Status', render: (r) => statusBadge(r.rent_status) },
  ], { pageSize: 20, emptyMessage: ' No tenant owes rent right now.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'arrears', perms: ['finance', 'payments', 'tenants'], title: 'Outstanding Rent', subtitle: 'Tenants who owe rent, biggest balance first — calculated live from the rent schedule.' });
  const props = await lookups.properties();
  qs('#pageRoot').innerHTML = `<div class="filters-bar">${selectHtml('fProp', 'Property', opts(props, 'id', 'name'))}<button class="btn btn-outline btn-sm" id="csvBtn" style="align-self:end">Export CSV</button><button class="btn btn-outline btn-sm no-print" style="align-self:end" onclick="print()">Print</button></div><div id="cards"></div><div id="tableMount"></div>`;
  qs('#fProp').addEventListener('change', (e) => load(e.target.value));
  qs('#csvBtn').addEventListener('click', () => downloadFile(api.url(`/analytics/reports/arrears${api.qs({ propertyId: qs('#fProp').value, format: 'csv' })}`), 'arrears.csv'));
  await load('');
}
main();
