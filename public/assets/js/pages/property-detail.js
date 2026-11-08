import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, opts, pctBar, KIND_LABEL, PURPOSE_LABEL, rentSummary } from '../utils.js';
import { lookups, param, card } from './_common.js';

const id = param('id');
let profile; let ucats = [];

const UNIT_FIELDS = (extra = []) => [
  { name: 'houseNo', label: 'House number', default: '01', placeholder: 'e.g. 03' },
  { name: 'unitNo', label: 'Unit number', required: true, placeholder: 'e.g. A-02' },
  { name: 'categoryId', label: 'Category', type: 'select', options: opts(ucats, 'id', 'name') },
  { name: 'rooms', label: 'Rooms', type: 'number', min: 0, default: 1 },
  { name: 'floor', label: 'Floor' },
  { name: 'monthlyRent', label: 'Monthly rent (FCFA)', type: 'number', min: 0, required: true },
  { name: 'securityDeposit', label: 'Security deposit (FCFA)', type: 'number', min: 0 },
  { name: 'hasKitchen', label: 'Kitchen', type: 'checkbox', checkLabel: 'Has kitchen' },
  { name: 'hasToilet', label: 'Toilet', type: 'checkbox', checkLabel: 'Has toilet' },
  { name: 'hasBathroom', label: 'Bathroom', type: 'checkbox', checkLabel: 'Has bathroom' },
  ...extra,
];

async function main() {
  profile = await initPortalLayout({ activeKey: 'properties', title: 'Property', subtitle: '' });
  const p = await api.get(`/properties/${id}`);
  ucats = await lookups.unitCategories();
  document.querySelector('.page-head h1').textContent = p.name;
  document.querySelector('.page-head p').textContent = `${p.property_code} · ${KIND_LABEL[p.kind]} · ${PURPOSE_LABEL[p.purpose]}`;
  const canEdit = profile.permissions.includes('properties');
  const isBuilding = p.kind !== 'LAND';

  qs('#pageActions').innerHTML = `<a class="btn btn-outline btn-sm" href="/admin/properties.html">&larr; All properties</a>`;
  qs('#pageRoot').innerHTML = `
    <div class="stat-grid">
      ${card('Status', statusBadge(p.construction_status), { sub: p.construction_status === 'UNCOMPLETED' ? `${p.completion_percent}% complete` : 'Ready' })}
      ${isBuilding ? card('Units', p.total_units, { sub: `${p.occupied_units} occupied · ${p.vacant_units} vacant` }) : card('Size', p.size_sqm ? `${Number(p.size_sqm).toLocaleString()} m²` : '—')}
      ${isBuilding ? card('Expected rent / month', formatCurrency(p.monthly_expected_rent), { sub: `Full potential ${formatCurrency(p.monthly_potential_rent)}` }) : card('Asking price', p.asking_price ? formatCurrency(p.asking_price) : '—')}
      ${card('Landlord', escapeHtml(p.landlord_name || '—'), { sub: `Manager: ${escapeHtml(p.manager_name || '—')}` })}
    </div>
    <div class="card card-pad" style="margin-top:20px">
      <dl class="kv"><dt>Location</dt><dd>${escapeHtml([p.location, p.city].filter(Boolean).join(', ') || '—')}</dd><dt>Address</dt><dd>${escapeHtml(p.address || '—')}</dd>
      <dt>Category</dt><dd>${escapeHtml(p.category_name || '—')}</dd><dt>Public website</dt><dd>${p.listed_publicly ? 'Listed' : 'Not listed'}</dd>
      ${p.expected_completion_date ? `<dt>Expected completion</dt><dd>${formatDate(p.expected_completion_date)}</dd>` : ''}</dl>
      ${p.construction_status === 'UNCOMPLETED' ? `<div style="margin-top:12px">${pctBar(p.completion_percent)}</div>` : ''}
      ${p.description ? `<p style="margin-top:14px">${escapeHtml(p.description)}</p>` : ''}
    </div>
    <div id="unitsSection"></div>
    <div id="tenantsSection"></div>`;

  if (isBuilding) {
    qs('#unitsSection').innerHTML = `<div class="section-title"><h2>Houses & units</h2><div>${canEdit ? '<button class="btn btn-outline btn-sm" id="bulkBtn">Add many units</button> <button class="btn btn-primary btn-sm" id="addUnitBtn">+ Add unit</button>' : ''}</div></div><div id="unitsMount"></div>`;
    const loadUnits = async () => {
      const units = await api.get(`/units?propertyId=${id}`);
      renderTable(qs('#unitsMount'), units, [
        { label: 'House', render: (u) => escapeHtml(u.house_no) }, { label: 'Unit', render: (u) => `<strong>${escapeHtml(u.unit_no)}</strong>` },
        { label: 'Category', render: (u) => escapeHtml(u.category_name || '—') }, { label: 'Rent', render: (u) => formatCurrency(u.monthly_rent) },
        { label: 'Status', render: (u) => statusBadge(u.status) },
        { label: 'Tenant', render: (u) => (u.tenant_id ? `<a href="/admin/tenant-profile.html?id=${u.tenant_id}">${escapeHtml(u.tenant_name)}</a>` : (u.status === 'VACANT' && profile.permissions.includes('tenants') ? `<a class="btn btn-sm btn-outline" href="/admin/register-tenant.html?unitId=${u.id}">Register tenant</a>` : '—')) },
      ], { pageSize: 12, emptyMessage: 'No units yet — add the first one.' });
    };
    await loadUnits();
    qs('#addUnitBtn')?.addEventListener('click', () => openFormModal({ title: 'Add a unit', fields: UNIT_FIELDS(), onSubmit: async (v) => { await api.post('/units', { ...v, propertyId: id, rooms: Number(v.rooms) || 1, monthlyRent: Number(v.monthlyRent), securityDeposit: Number(v.securityDeposit) || 0 }); await loadUnits(); } }));
    qs('#bulkBtn')?.addEventListener('click', () => openFormModal({ title: 'Add many identical units', intro: 'Creates numbered units in one go — e.g. 12 × "1 Room" in House 03 → A-01 … A-12.',
      fields: [{ name: 'count', label: 'How many units', type: 'number', min: 1, max: 200, required: true }, { name: 'prefix', label: 'Number prefix', placeholder: 'A-' }, { name: 'startAt', label: 'Start numbering at', type: 'number', default: 1 }, ...UNIT_FIELDS().filter((f) => f.name !== 'unitNo')],
      onSubmit: async (v) => { await api.post('/units/bulk', { ...v, propertyId: id, count: Number(v.count), startAt: Number(v.startAt) || 1, rooms: Number(v.rooms) || 1, monthlyRent: Number(v.monthlyRent), securityDeposit: Number(v.securityDeposit) || 0 }); await loadUnits(); } }));

    if (profile.permissions.includes('tenants')) {
      qs('#tenantsSection').innerHTML = '<div class="section-title"><h2>Current tenants</h2></div><div id="tenMount"></div>';
      const rows = await api.get(`/tenants?propertyId=${id}`);
      renderTable(qs('#tenMount'), rows, [
        { label: 'Tenant', render: (t) => `<a href="/admin/tenant-profile.html?id=${t.id}"><strong>${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)}</strong></a>` },
        { label: 'Unit', render: (t) => `${escapeHtml(t.house_no)} / ${escapeHtml(t.unit_no)}` }, { label: 'Rent', render: (t) => formatCurrency(t.monthly_rent) },
        { label: 'Position', render: (t) => rentSummary(t.rent) }, { label: 'Next payment', render: (t) => formatDate(t.rent.nextPaymentDate) }, { label: 'Rent status', render: (t) => statusBadge(t.rent.status) },
      ], { pageSize: 10, emptyMessage: 'No current tenants.' });
    }
  }
}
main();
