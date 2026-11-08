import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, opts, debounce, rentSummary } from '../utils.js';
import { lookups, param, selectHtml } from './_common.js';

let profile; let table;
const state = { propertyId: '', categoryId: '', rentStatus: param('rentStatus'), status: 'CURRENT', q: '', expiringDays: param('expiring') };

async function load() {
  const rows = await api.get(`/tenants${api.qs(state)}`);
  const cols = [
    { label: 'Tenant', render: (t) => `<a href="/admin/tenant-profile.html?id=${t.id}"><strong>${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)}</strong></a><div class="text-muted mono" style="font-size:.72rem">${escapeHtml(t.tenant_code)} · ${escapeHtml(t.phone)}</div>` },
    { label: 'Property / unit', render: (t) => `${escapeHtml(t.property_name)}<div class="text-muted" style="font-size:.78rem">House ${escapeHtml(t.house_no)} · Unit ${escapeHtml(t.unit_no)}${t.category_name ? ` · ${escapeHtml(t.category_name)}` : ''}</div>` },
    { label: 'Rent', render: (t) => formatCurrency(t.monthly_rent) },
    { label: 'Position', render: (t) => `${rentSummary(t.rent)}${t.rent.amountOwing ? `<div class="text-muted" style="font-size:.76rem">${formatCurrency(t.rent.amountOwing)} owing</div>` : ''}` },
    { label: 'Next payment', render: (t) => (['MOVED_OUT', 'EVICTED'].includes(t.status) ? '—' : formatDate(t.rent.nextPaymentDate)) },
    { label: 'Contract ends', render: (t) => formatDate(t.contract_end) },
    { label: 'Status', render: (t) => (['MOVED_OUT', 'EVICTED', 'NOTICE'].includes(t.status) ? statusBadge(t.status) : statusBadge(t.rent.status)) },
  ];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { emptyMessage: 'No tenants match these filters.' });
  qs('#summary').textContent = `${rows.length} tenant${rows.length === 1 ? '' : 's'}`;
}

async function main() {
  profile = await initPortalLayout({ activeKey: 'tenants', title: 'Tenants', subtitle: 'Every tenant with months paid, owing and paid in advance — calculated live.' });
  const [props, cats] = await Promise.all([lookups.properties(), lookups.unitCategories()]);
  if (profile.permissions.includes('tenants')) qs('#pageActions').innerHTML = '<a class="btn btn-primary" href="/admin/register-tenant.html">+ Register tenant</a>';
  qs('#pageRoot').innerHTML = `<div class="filters-bar">
    ${selectHtml('fProp', 'Property', opts(props.filter((p) => p.kind !== 'LAND'), 'id', 'name'))}
    ${selectHtml('fCat', 'Category', opts(cats, 'id', 'name'))}
    ${selectHtml('fRent', 'Rent position', [['OWING', 'Owing'], ['ADVANCE', 'Paid in advance'], ['UP_TO_DATE', 'Up to date'], ['DUE_SOON', 'Due soon'], ['OVERDUE', 'Overdue'], ['SERIOUS_ARREARS', '3+ months owing']].map(([value, label]) => ({ value, label })), { all: 'Any' })}
    <div><label style="font-size:.72rem;text-transform:uppercase;color:var(--slate-500);font-weight:700;display:block;margin-bottom:4px">Show</label><select id="fStatus"><option value="CURRENT">Current tenants</option><option value="MOVED_OUT">Moved out</option><option value="EVICTED">Evicted</option><option value="ALL">Everyone</option></select></div>
    <div class="search-input-wrap" style="align-self:end"><input id="fQ" type="search" placeholder="Name, ID, phone, unit…" /></div>
    ${profile.permissions.includes('finance') || profile.permissions.includes('tenants') ? '<button class="btn btn-outline btn-sm" id="csvBtn" style="align-self:end">Export CSV</button>' : ''}</div>
    <div class="text-muted" id="summary" style="margin-bottom:10px"></div><div id="tableMount"></div>`;
  qs('#fRent').value = state.rentStatus;
  qs('#fProp').addEventListener('change', (e) => { state.propertyId = e.target.value; load(); });
  qs('#fCat').addEventListener('change', (e) => { state.categoryId = e.target.value; load(); });
  qs('#fRent').addEventListener('change', (e) => { state.rentStatus = e.target.value; load(); });
  qs('#fStatus').addEventListener('change', (e) => { state.status = e.target.value; load(); });
  qs('#fQ').addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }));
  qs('#csvBtn')?.addEventListener('click', () => downloadFile(api.url(`/analytics/reports/tenants${api.qs({ propertyId: state.propertyId, status: state.status === 'ALL' ? 'ALL' : state.status, format: 'csv' })}`), 'tenants.csv'));
  await load();
}
main();
