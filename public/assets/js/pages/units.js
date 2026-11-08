import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, statusBadge, opts, debounce } from '../utils.js';
import { lookups, param, selectHtml } from './_common.js';

let profile; let rows = []; let table; let ucats = [];
const state = { propertyId: '', categoryId: '', status: param('status'), q: param('q') };

async function load() {
  rows = await api.get(`/units${api.qs(state)}`);
  const cols = [
    { label: 'Property', render: (u) => `<a href="/admin/property-detail.html?id=${u.property_id}">${escapeHtml(u.property_name)}</a>` },
    { label: 'House', render: (u) => escapeHtml(u.house_no) }, { label: 'Unit', render: (u) => `<strong>${escapeHtml(u.unit_no)}</strong>` },
    { label: 'Category', render: (u) => escapeHtml(u.category_name || '—') }, { label: 'Rooms', render: (u) => `${u.rooms}${u.has_kitchen ? ' · K' : ''}${u.has_toilet || u.has_bathroom ? ' · WC' : ''}` },
    { label: 'Rent / month', render: (u) => formatCurrency(u.monthly_rent) }, { label: 'Status', render: (u) => statusBadge(u.status) + (u.status === 'VACANT' && u.vacant_days ? ` <span class="text-muted" style="font-size:.74rem">${u.vacant_days}d</span>` : '') },
    { label: 'Tenant', render: (u) => (u.tenant_id ? `<a href="/admin/tenant-profile.html?id=${u.tenant_id}">${escapeHtml(u.tenant_name)}</a>` : '—') },
    { label: '', render: (u) => `<span class="no-print">${u.status === 'VACANT' && profile.permissions.includes('tenants') ? `<a class="btn btn-sm btn-primary" href="/admin/register-tenant.html?unitId=${u.id}">Register tenant</a> ` : ''}${profile.permissions.includes('properties') ? `<button class="btn btn-sm btn-ghost" data-edit="${u.id}">Edit</button>` : ''}</span>` },
  ];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { emptyMessage: 'No units match.' });
  qs('#summary').textContent = `${rows.length} units · ${rows.filter((r) => r.status === 'OCCUPIED').length} occupied · ${rows.filter((r) => r.status === 'VACANT').length} vacant`;
}

async function main() {
  profile = await initPortalLayout({ activeKey: 'units', title: 'Houses / Units', subtitle: 'Every rentable house and unit, with who lives there. Use the Vacant filter for the vacancy list.' });
  const [props, cats] = await Promise.all([lookups.properties(), lookups.unitCategories()]);
  ucats = cats;
  qs('#pageRoot').innerHTML = `<div class="filters-bar">
    ${selectHtml('fProp', 'Property', opts(props.filter((p) => p.kind !== 'LAND'), 'id', 'name'))}
    ${selectHtml('fCat', 'Category', opts(cats, 'id', 'name'))}
    ${selectHtml('fStatus', 'Status', [['VACANT', 'Vacant'], ['OCCUPIED', 'Occupied'], ['RESERVED', 'Reserved'], ['MAINTENANCE', 'Under maintenance']].map(([value, label]) => ({ value, label })))}
    <div class="search-input-wrap" style="align-self:end"><input id="fQ" type="search" placeholder="Search unit or house no…" value="${escapeHtml(state.q)}" /></div>
    <button class="btn btn-outline btn-sm no-print" style="align-self:end" onclick="print()">Print</button></div>
    <div class="text-muted" id="summary" style="margin-bottom:10px"></div><div id="tableMount"></div>`;
  qs('#fStatus').value = state.status;
  qs('#fProp').addEventListener('change', (e) => { state.propertyId = e.target.value; load(); });
  qs('#fCat').addEventListener('change', (e) => { state.categoryId = e.target.value; load(); });
  qs('#fStatus').addEventListener('change', (e) => { state.status = e.target.value; load(); });
  qs('#fQ').addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }));
  await load();
  qs('#tableMount').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const u = rows.find((x) => x.id === b.dataset.edit);
    openFormModal({ title: `Edit House ${u.house_no} · Unit ${u.unit_no}`, initial: { ...u, houseNo: u.house_no, unitNo: u.unit_no, categoryId: u.category_id, monthlyRent: u.monthly_rent, securityDeposit: u.security_deposit, hasKitchen: u.has_kitchen, hasToilet: u.has_toilet, hasBathroom: u.has_bathroom },
      fields: [{ name: 'houseNo', label: 'House number' }, { name: 'unitNo', label: 'Unit number', required: true }, { name: 'categoryId', label: 'Category', type: 'select', options: opts(ucats, 'id', 'name') }, { name: 'rooms', label: 'Rooms', type: 'number', min: 0 }, { name: 'floor', label: 'Floor' },
        { name: 'monthlyRent', label: 'Monthly rent', type: 'number', min: 0 }, { name: 'securityDeposit', label: 'Deposit', type: 'number', min: 0 },
        ...(u.tenant_id ? [] : [{ name: 'status', label: 'Availability', type: 'select', noBlank: true, options: [{ value: 'VACANT', label: 'Vacant' }, { value: 'RESERVED', label: 'Reserved' }, { value: 'MAINTENANCE', label: 'Under maintenance' }] }]),
        { name: 'hasKitchen', label: 'Kitchen', type: 'checkbox', checkLabel: 'Has kitchen' }, { name: 'hasToilet', label: 'Toilet', type: 'checkbox', checkLabel: 'Has toilet' }, { name: 'hasBathroom', label: 'Bathroom', type: 'checkbox', checkLabel: 'Has bathroom' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
      onSubmit: async (v) => { await api.patch(`/units/${u.id}`, { ...v, rooms: Number(v.rooms) || 0, monthlyRent: Number(v.monthlyRent) || 0, securityDeposit: Number(v.securityDeposit) || 0 }); await load(); } });
  });
}
main();
