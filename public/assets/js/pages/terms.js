import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal, openModal, confirmDialog } from '../crud-table.js';
import { qs, escapeHtml, formatDate, statusBadge } from '../utils.js';

let rows = [];
const FIELDS = [{ name: 'title', label: 'Title', required: true, full: true }, { name: 'body', label: 'Terms & conditions text', type: 'textarea', rows: 14, required: true, full: true, help: 'Plain text. Line breaks are kept. Tenants must read and accept this in their portal.' }];
async function load() {
  rows = await api.get('/contracts/terms');
  renderTable(qs('#tableMount'), rows, [
    { label: 'Version', render: (t) => `<strong>v${t.version}</strong>` }, { label: 'Title', render: (t) => escapeHtml(t.title) }, { label: 'Status', render: (t) => statusBadge(t.status) },
    { label: 'Published', render: (t) => formatDate(t.published_at) }, { label: 'Accepted by', render: (t) => `${t.acceptances} tenant(s)` },
    { label: '', render: (t) => `<button class="btn btn-sm btn-ghost" data-view="${t.id}">View</button>${t.status === 'DRAFT' ? `<button class="btn btn-sm btn-ghost" data-edit="${t.id}">Edit</button><button class="btn btn-sm btn-primary" data-pub="${t.id}">Publish</button>` : ''}` },
  ], { emptyMessage: 'No terms yet. Create the first version, then publish it.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'terms', perms: ['properties', 'tenants', 'contracts'], title: 'Terms & Conditions', subtitle: 'Create → edit → publish. Tenants must accept the current version; every acceptance is recorded with date and time.' });
  qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ New version</button>';
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'New terms version (saved as draft)', wide: true, fields: FIELDS, onSubmit: async (v) => { await api.post('/contracts/terms', v); await load(); } }));
  qs('#tableMount').addEventListener('click', async (e) => {
    const get = (a) => rows.find((x) => x.id === e.target.closest(`[data-${a}]`)?.dataset[a]);
    const v = get('view'); const ed = get('edit'); const pb = get('pub');
    if (v) openModal({ title: `v${v.version} — ${v.title}`, wide: true, html: `<div style="white-space:pre-wrap;max-height:60vh;overflow:auto;font-size:.9rem">${escapeHtml(v.body)}</div>` });
    if (ed) openFormModal({ title: `Edit draft v${ed.version}`, wide: true, fields: FIELDS, initial: ed, onSubmit: async (x) => { await api.patch(`/contracts/terms/${ed.id}`, x); await load(); } });
    if (pb && (await confirmDialog(`Publish v${pb.version}? It becomes the current terms and the previous version is archived. Tenants will be asked to accept it.`, { confirmLabel: 'Publish' }))) { await api.post(`/contracts/terms/${pb.id}/publish`, {}); await load(); }
  });
  await load();
}
main();
