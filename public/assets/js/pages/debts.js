import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, opts, toast } from '../utils.js';
import { lookups, card } from './_common.js';

let rows = []; let props = []; let table; let filter = 'OPEN';
async function load() {
  rows = await api.get(`/finance/debts${api.qs({ status: filter === 'ALL' ? '' : filter })}`);
  qs('#cards').innerHTML = `<div class="stat-grid">${card('Outstanding', formatCurrency(rows.reduce((s, r) => s + (r.status === 'PAID' ? 0 : r.balance), 0)), { cls: 'warn' })}${card('Overdue', rows.filter((r) => r.status === 'OVERDUE').length)}${card('Debts shown', rows.length)}</div>`;
  const cols = [
    { label: 'Debtor', render: (d) => `<strong>${escapeHtml(d.debtor_name)}</strong><div class="text-muted" style="font-size:.78rem">${escapeHtml(d.debtor_contact || '')}</div>` },
    { label: 'For', render: (d) => `${escapeHtml(d.description || '—')}${d.property_name ? `<div class="text-muted" style="font-size:.76rem">${escapeHtml(d.property_name)}</div>` : ''}` },
    { label: 'Total', render: (d) => formatCurrency(d.total_amount) }, { label: 'Paid', render: (d) => formatCurrency(d.amount_paid) }, { label: 'Balance', render: (d) => `<strong>${formatCurrency(d.balance)}</strong>` },
    { label: 'Due', render: (d) => formatDate(d.due_date) }, { label: 'Status', render: (d) => statusBadge(d.status) },
    { label: '', render: (d) => (d.status !== 'PAID' ? `<button class="btn btn-sm btn-primary" data-pay="${d.id}">Record payment</button>` : '') },
  ];
  if (table) table.redraw(rows); else table = renderTable(qs('#tableMount'), rows, cols, { emptyMessage: 'No debts here.' });
}
async function main() {
  await initPortalLayout({ activeKey: 'debts', perms: ['finance'], title: 'Debt Tracking', subtitle: 'Money owed to you beyond monthly rent — land/house sale instalments, damages, deposit top-ups, loans. (Rent arrears are on the Outstanding Rent page.)' });
  props = await lookups.properties();
  qs('#pageActions').innerHTML = '<button class="btn btn-primary" id="addBtn">+ Record a debt</button>';
  qs('#pageRoot').innerHTML = `<div class="chip-row" id="chips">${[['OPEN', 'Unpaid'], ['OVERDUE', 'Overdue'], ['PAID', 'Paid'], ['ALL', 'All']].map(([v, l]) => `<button class="chip ${v === filter ? 'is-active' : ''}" data-s="${v}">${l}</button>`).join('')}</div><div id="cards"></div><div id="tableMount"></div>`;
  qs('#chips').addEventListener('click', (e) => { const c = e.target.closest('[data-s]'); if (!c) return; filter = c.dataset.s; qs('#chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c)); load(); });
  qs('#addBtn').addEventListener('click', () => openFormModal({ title: 'Record a debt', fields: [{ name: 'debtorName', label: 'Who owes', required: true }, { name: 'debtorContact', label: 'Phone' }, { name: 'description', label: 'What for', full: true, placeholder: 'e.g. Balance on Plot 12, damaged door' }, { name: 'propertyId', label: 'Property (optional)', type: 'select', options: opts(props, 'id', 'name') },
    { name: 'totalAmount', label: 'Total owed (FCFA)', type: 'number', min: 1, required: true }, { name: 'amountPaid', label: 'Already paid', type: 'number', min: 0, default: 0 }, { name: 'dueDate', label: 'Due date', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
    onSubmit: async (v) => { await api.post('/finance/debts', { ...v, totalAmount: Number(v.totalAmount), amountPaid: Number(v.amountPaid) || 0 }); await load(); } }));
  qs('#tableMount').addEventListener('click', (e) => { const b = e.target.closest('[data-pay]'); if (!b) return; const d = rows.find((x) => x.id === b.dataset.pay);
    openFormModal({ title: `Payment from ${d.debtor_name}`, intro: `Balance: <strong>${formatCurrency(d.balance)}</strong>`, fields: [{ name: 'amount', label: 'Amount (FCFA)', type: 'number', min: 1, max: d.balance, required: true, default: d.balance }, { name: 'paymentMethod', label: 'Method', type: 'select', noBlank: true, options: [['CASH', 'Cash'], ['MTN_MOMO', 'MTN MoMo'], ['ORANGE_MONEY', 'Orange Money'], ['BANK', 'Bank']].map(([value, label]) => ({ value, label })) }],
      onSubmit: async (v) => { await api.post(`/finance/debts/${d.id}/pay`, { amount: Number(v.amount), paymentMethod: v.paymentMethod }); toast('Payment recorded.', 'success'); await load(); } }); });
  await load();
}
main();
