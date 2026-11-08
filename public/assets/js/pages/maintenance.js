import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, opts, toast } from '../utils.js';
import { lookups, selectHtml } from './_common.js';

let rows = []; let workers = []; let table; let props = []; let units = [];
const state = { status: 'OPEN', propertyId: '' };
const STATUS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];

async function load() {
  rows = await api.get(`/maintenance${api.qs(state)}`);
  const cols = [
    { label: 'Request', render: (m) => `<span class="mono" style="font-size:.76rem">${escapeHtml(m.request_no)}</span><div><strong>${escapeHtml(m.title)}</strong></div><div class="text-muted" style="font-size:.78rem">${escapeHtml((m.description || '').slice(0, 90))}</div>` },
    { label: 'Where', render: (m) => `${escapeHtml(m.property_name)}<div class="text-muted" style="font-size:.78rem">${m.unit_no ? `House ${escapeHtml(m.house_no)} · Unit ${escapeHtml(m.unit_no)}` : 'Whole property'}${m.tenant_name ? ` · ${escapeHtml(m.tenant_name)}` : ''}</div>` },
    { label: 'Priority', render: (m) => statusBadge(m.priority) }, { label: 'Status', render: (m) => statusBadge(m.status) },
    { label: 'Assigned to', render: (m) => (m.worker_name ? `${escapeHtml(m.worker_name)}<div class="text-muted" style="font-size:.76rem">${escapeHtml(m.worker_trade)}</div>` : '—') },
    { label: 'Cost', render: (m) => `${m.actual_cost !== null ? formatCurrency(m.actual_cost) : '—'}<div class="text-muted" style="font-size:.74rem">est. ${m.estimated_cost !== null ? formatCurrency(m.estimated_cost) : '—'}</div>` },
    { label: 'Reported', render: (m) => `${formatDate(m.reported_at)}<div class="text-muted" style="font-size:.74rem">${m.age_days}d ago</div>` },
    { label: '', render: (m) => `<button class="btn btn-sm btn-outline" data-upd="${m.id}">Manage</button>` },
  ];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { emptyMessage: 'No requests in this view.' });
}
function manage(m) {
  openFormModal({ title: `${m.request_no} — ${m.title}`, wide: true, intro: `${escapeHtml(m.description || '')}`,
    initial: { status: m.status, workerId: m.worker_id, priority: m.priority, estimatedCost: m.estimated_cost, actualCost: m.actual_cost, materials: m.materials, notes: m.notes },
    fields: [{ name: 'status', label: 'Status', type: 'select', noBlank: true, options: STATUS.map((s) => ({ value: s, label: s.replace('_', ' ') })) }, { name: 'priority', label: 'Priority', type: 'select', noBlank: true, options: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => ({ value: s, label: s })) },
      { name: 'workerId', label: 'Assign to', type: 'select', options: workers.map((w) => ({ value: w.id, label: `${w.name} — ${w.trade}` })) }, { name: 'estimatedCost', label: 'Estimated cost', type: 'number', min: 0 },
      { name: 'actualCost', label: 'Actual cost', type: 'number', min: 0, help: 'When completed with a cost, it is added to Expenses automatically.' }, { name: 'materials', label: 'Materials used' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
    onSubmit: async (v) => { await api.patch(`/maintenance/${m.id}`, v); toast('Updated.', 'success'); await load(); } });
}
async function main() {
  await initPortalLayout({ activeKey: 'maintenance', perms: ['maintenance'], title: 'Maintenance', subtitle: 'Tenant-reported problems, who is fixing them and what it cost.' });
  [props, workers] = await Promise.all([lookups.properties(), api.get('/maintenance/workers')]);
  qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ New request</button> <button class="btn btn-outline" id="wBtn">+ Add worker</button>';
  qs('#pageRoot').innerHTML = `<div class="chip-row" id="chips">${[['OPEN', 'Open'], ['PENDING', 'Pending'], ['IN_PROGRESS', 'In progress'], ['COMPLETED', 'Completed'], ['REJECTED', 'Rejected'], ['', 'All']].map(([v, l]) => `<button class="chip ${v === state.status ? 'is-active' : ''}" data-s="${v}">${l}</button>`).join('')}</div>
    <div class="filters-bar">${selectHtml('fProp', 'Property', opts(props, 'id', 'name'))}</div><div id="tableMount"></div>`;
  qs('#chips').addEventListener('click', (e) => { const c = e.target.closest('[data-s]'); if (!c) return; state.status = c.dataset.s; qs('#chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c)); load(); });
  qs('#fProp').addEventListener('change', (e) => { state.propertyId = e.target.value; load(); });
  qs('#tableMount').addEventListener('click', (e) => { const b = e.target.closest('[data-upd]'); if (b) manage(rows.find((x) => x.id === b.dataset.upd)); });
  qs('#wBtn').addEventListener('click', () => openFormModal({ title: 'Add worker / contractor', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'trade', label: 'Trade', type: 'select', noBlank: true, options: ['Plumber', 'Electrician', 'Technician', 'Cleaner', 'Contractor', 'Painter', 'Carpenter', 'Security'].map((t) => ({ value: t, label: t })) }, { name: 'phone', label: 'Phone' }], onSubmit: async (v) => { await api.post('/maintenance/workers', v); workers = await api.get('/maintenance/workers'); toast('Worker added.', 'success'); } }));
  qs('#addBtn').addEventListener('click', async () => openFormModal({ title: 'New maintenance request',
    fields: [{ name: 'propertyId', label: 'Property', type: 'select', required: true, options: opts(props.filter((p) => p.kind !== 'LAND'), 'id', 'name') }, { name: 'unitId', label: 'Unit (optional — leave blank for the whole property)', type: 'select', options: [] }, { name: 'title', label: 'Problem', required: true, full: true, placeholder: 'e.g. Broken water pipe' }, { name: 'description', label: 'Details', type: 'textarea', full: true }, { name: 'priority', label: 'Priority', type: 'select', noBlank: true, default: 'NORMAL', options: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => ({ value: s, label: s })) }],
    onSubmit: async (v) => { await api.post('/maintenance', v); await load(); } }).form.querySelector('#mf_propertyId').addEventListener('change', async (e) => {
      units = e.target.value ? await api.get(`/units?propertyId=${e.target.value}`) : [];
      document.querySelector('#mf_unitId').innerHTML = `<option value="">Whole property</option>${units.map((u) => `<option value="${u.id}">House ${escapeHtml(u.house_no)} · Unit ${escapeHtml(u.unit_no)}</option>`).join('')}`; }));
  await load();
}
main();
