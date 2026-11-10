import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal, confirmDialog } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDateTime, METHOD_LABEL, toast } from '../utils.js';

let rows = [];
async function load() {
  rows = await api.get('/payments/pending');
  qs('#pageRoot').innerHTML = rows.length ? '<div id="tableMount"></div>' : '<div class="empty-state card"> Nothing is waiting for confirmation.</div>';
  if (!rows.length) return;
  renderTable(qs('#tableMount'), rows, [
    { label: 'Submitted', render: (p) => formatDateTime(p.created_at) },
    { label: 'Tenant', render: (p) => `<a href="/admin/tenant-profile.html?id=${p.tenant_id}"><strong>${escapeHtml(p.tenant_name)}</strong></a><div class="text-muted" style="font-size:.78rem">${escapeHtml(p.tenant_phone)}</div>` },
    { label: 'Property / unit', render: (p) => `${escapeHtml(p.property_name)}<div class="text-muted" style="font-size:.78rem">House ${escapeHtml(p.house_no)} · Unit ${escapeHtml(p.unit_no)}</div>` },
    { label: 'Amount', render: (p) => `<strong>${formatCurrency(p.amount)}</strong><div class="text-muted" style="font-size:.76rem">${escapeHtml(p.type)} · rent ${formatCurrency(p.monthly_rent)}/mo</div>` },
    { label: 'Method / txn ID', render: (p) => `${escapeHtml(METHOD_LABEL[p.method] || p.method)}<div class="mono" style="font-size:.78rem">${escapeHtml(p.transaction_reference)}</div>` },
    { label: 'Tenant says paid', render: (p) => `${formatDateTime(p.tenant_paid_at)}${p.proof_note ? `<div class="text-muted" style="font-size:.76rem;max-width:200px">${escapeHtml(p.proof_note)}</div>` : ''}` },
    { label: '', render: (p) => `<button class="btn btn-sm btn-primary" data-ok="${p.id}">Confirm</button> <button class="btn btn-sm btn-danger" data-no="${p.id}">Reject</button>` },
  ], { emptyMessage: 'Nothing pending.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'pending-payments', perms: ['payments'], title: 'Pending Payments', subtitle: 'Check the Mobile Money message first. Nothing is credited to the tenant until you confirm.' });
  qs('#pageRoot').addEventListener('click', async (e) => {
    const ok = e.target.closest('[data-ok]'); const no = e.target.closest('[data-no]');
    if (ok) { const p = rows.find((x) => x.id === ok.dataset.ok);
      if (await confirmDialog(`Confirm ${formatCurrency(p.amount)} from ${p.tenant_name}? Transaction ${p.transaction_reference} must appear in the MoMo account first.`, { confirmLabel: 'Yes, money received' })) { const r = await api.post(`/payments/${p.id}/confirm`, {}); toast(`Confirmed. Receipt ${r.receipt_number}.`, 'success'); await load(); } }
    if (no) { const p = rows.find((x) => x.id === no.dataset.no);
      openFormModal({ title: `Reject payment from ${p.tenant_name}`, fields: [{ name: 'reason', label: 'Reason (shown to the tenant)', type: 'textarea', full: true, required: true, placeholder: 'e.g. Transaction ID not found in our MoMo account' }], submitLabel: 'Reject', onSubmit: async (v) => { await api.post(`/payments/${p.id}/reject`, v); await load(); } }); }
  });
  await load();
}
main();
