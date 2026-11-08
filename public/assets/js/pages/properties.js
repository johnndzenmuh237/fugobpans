import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { openFormModal } from '../crud-table.js';
import { qs, qsa, escapeHtml, formatCurrency, formatDate, statusBadge, opts, pctBar, KIND_ICON, KIND_LABEL, PURPOSE_LABEL, debounce } from '../utils.js';
import { lookups, param } from './_common.js';

let profile; let cats = []; let landlords = []; let managers = [];
const state = { kind: '', constructionStatus: '', purpose: '', q: param('q') };

const FIELDS = (isEdit) => [
  { heading: 'Basics' },
  { name: 'name', label: 'Name', required: true, full: true, placeholder: 'e.g. Bonaberi Estate, or "Plot 12 — Logbessou"' },
  { name: 'kind', label: 'Type', type: 'select', noBlank: true, required: true, default: 'ESTATE', options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label: `${KIND_ICON[value]} ${label}` })) },
  { name: 'categoryId', label: 'Property category', type: 'select', options: opts(cats, 'id', 'name') },
  { name: 'purpose', label: 'Purpose', type: 'select', noBlank: true, default: 'RENT', options: Object.entries(PURPOSE_LABEL).map(([value, label]) => ({ value, label })) },
  { name: 'landlordId', label: 'Landlord / owner', type: 'select', options: opts(landlords, 'id', 'name') },
  ...(profile.role === 'ADMIN' ? [{ name: 'managerId', label: 'Responsible manager', type: 'select', options: opts(managers, 'id', 'name') }] : []),
  { heading: 'Construction' },
  { name: 'constructionStatus', label: 'Construction status', type: 'select', noBlank: true, default: 'COMPLETED', options: [{ value: 'COMPLETED', label: 'Completed' }, { value: 'UNCOMPLETED', label: 'Uncompleted / under construction' }] },
  { name: 'completionPercent', label: 'Completion %', type: 'number', min: 0, max: 100, help: 'Only for uncompleted buildings.' },
  { name: 'expectedCompletionDate', label: 'Expected completion date', type: 'date' },
  { heading: 'Location & price' },
  { name: 'location', label: 'Neighbourhood / location' },
  { name: 'city', label: 'City' },
  { name: 'address', label: 'Address / directions', full: true },
  { name: 'sizeSqm', label: 'Size (m²)', type: 'number', step: 'any', min: 0 },
  { name: 'askingPrice', label: 'Asking price (sale)', type: 'number', min: 0 },
  { name: 'photoUrl', label: 'Photo URL', full: true, placeholder: 'https://…', help: 'Link to an image of the property (optional).' },
  { name: 'description', label: 'Description', type: 'textarea', full: true },
  { name: 'listedPublicly', label: 'Public website', type: 'checkbox', checkLabel: 'Show this property on the public website' },
  ...(isEdit ? [{ name: 'status', label: 'Status', type: 'select', noBlank: true, options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }, { value: 'SOLD', label: 'Sold' }] }] : []),
];

function payload(v) {
  const o = { ...v };
  ['completionPercent', 'sizeSqm', 'askingPrice'].forEach((k) => { if (o[k] === '') delete o[k]; else o[k] = Number(o[k]); });
  if (o.constructionStatus === 'COMPLETED') delete o.completionPercent;
  return o;
}

function cardHtml(p) {
  const uncompleted = p.construction_status === 'UNCOMPLETED';
  const bg = p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}')"` : '';
  return `<article class="prop-card">
    <div class="prop-media k-${p.kind}" ${bg}>${p.photo_url ? '' : KIND_ICON[p.kind]}
      <div class="tags">${statusBadge(p.construction_status)}${p.listed_publicly ? '<span class="badge badge-info">Public</span>' : ''}${p.status !== 'ACTIVE' ? statusBadge(p.status) : ''}</div></div>
    <div class="prop-body">
      <div class="text-muted mono" style="font-size:.72rem">${escapeHtml(p.property_code)} · ${KIND_LABEL[p.kind]}${p.category_name ? ` · ${escapeHtml(p.category_name)}` : ''}</div>
      <h3><a href="/admin/property-detail.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
      <div class="prop-meta"><span>📍 ${escapeHtml(p.location || p.city || '—')}</span>${p.size_sqm ? `<span>${Number(p.size_sqm).toLocaleString()} m²</span>` : ''}<span>${PURPOSE_LABEL[p.purpose]}</span></div>
      ${p.asking_price ? `<div class="prop-price">${formatCurrency(p.asking_price)}</div>` : ''}
      ${p.total_units ? `<div class="prop-meta"><span>${p.occupied_units}/${p.total_units} units occupied</span><span>Expected ${formatCurrency(p.monthly_expected_rent)}/mo</span></div>` : ''}
      ${uncompleted ? `<div style="margin-top:4px"><div class="prop-meta"><span>${p.completion_percent}% built</span>${p.expected_completion_date ? `<span>Due ${formatDate(p.expected_completion_date)}</span>` : ''}</div>${pctBar(p.completion_percent)}</div>` : ''}
      <div style="margin-top:auto;padding-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-outline btn-sm" href="/admin/property-detail.html?id=${p.id}">Open</a>
        ${profile.permissions.includes('properties') ? `<button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>` : ''}
      </div></div></article>`;
}

async function load() {
  const rows = await api.get(`/properties${api.qs(state)}`);
  qs('#count').textContent = `${rows.length} propert${rows.length === 1 ? 'y' : 'ies'}`;
  qs('#grid').innerHTML = rows.length ? `<div class="prop-grid">${rows.map(cardHtml).join('')}</div>` : '<div class="empty-state card">No properties match these filters yet.</div>';
  qsa('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const p = rows.find((x) => x.id === b.dataset.edit);
    openFormModal({ title: `Edit ${p.name}`, wide: true, fields: FIELDS(true), initial: p && { ...p, expectedCompletionDate: p.expected_completion_date?.slice(0, 10), categoryId: p.category_id, landlordId: p.landlord_id, managerId: p.manager_id, constructionStatus: p.construction_status, completionPercent: p.completion_percent, sizeSqm: p.size_sqm, askingPrice: p.asking_price, photoUrl: p.photo_url, listedPublicly: p.listed_publicly },
      onSubmit: async (v) => { await api.patch(`/properties/${p.id}`, payload(v)); await load(); } });
  }));
}

async function main() {
  profile = await initPortalLayout({ activeKey: 'properties', title: 'Properties & Lands', subtitle: 'Estates, houses, commercial buildings and land — completed or still under construction.' });
  [cats, landlords] = await Promise.all([lookups.propertyCategories(), lookups.landlords()]);
  if (profile.role === 'ADMIN') managers = (await api.get('/users')).filter((u) => u.role === 'MANAGER');

  qs('#pageRoot').innerHTML = `
    <div class="chip-row" id="kindChips">${[['', 'All'], ['LAND', '🌿 Lands'], ['HOUSE', '🏠 Houses'], ['ESTATE', '🏘️ Estates'], ['COMMERCIAL', '🏢 Commercial']].map(([v, l]) => `<button class="chip ${state.kind === v ? 'is-active' : ''}" data-kind="${v}">${l}</button>`).join('')}</div>
    <div class="filters-bar">
      <select id="fBuild"><option value="">Completed &amp; uncompleted</option><option value="COMPLETED">Completed only</option><option value="UNCOMPLETED">Uncompleted only</option></select>
      <select id="fPurpose"><option value="">Any purpose</option>${Object.entries(PURPOSE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <div class="search-input-wrap"><input id="fQ" type="search" placeholder="Search name, code, location…" value="${escapeHtml(state.q)}" /></div>
      <span class="text-muted" id="count"></span>
    </div><div id="grid"><div class="spinner"></div></div>`;

  if (profile.permissions.includes('properties')) {
    qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ Add property / land</button>';
    qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'Add a property or land', wide: true, fields: FIELDS(false), submitLabel: 'Save property',
      onSubmit: async (v) => { await api.post('/properties', payload(v)); await load(); } }));
  }
  qsa('#kindChips .chip').forEach((c) => c.addEventListener('click', () => { state.kind = c.dataset.kind; qsa('#kindChips .chip').forEach((x) => x.classList.toggle('is-active', x === c)); load(); }));
  qs('#fBuild').addEventListener('change', (e) => { state.constructionStatus = e.target.value; load(); });
  qs('#fPurpose').addEventListener('change', (e) => { state.purpose = e.target.value; load(); });
  qs('#fQ').addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }, 300));
  await load();
}
main();
