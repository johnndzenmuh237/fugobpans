import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDateTime, qs } from './utils.js';

async function load() {
  const rows = await api.get('/payments/manual/pending');
  renderTable(qs('#tableMount'), rows, [
    { key: 'created_at', label: 'Submitted', render: (r) => formatDateTime(r.created_at) },
    { key: 'student', label: 'Student', render: (r) => `${r.first_name} ${r.last_name} <span class="text-muted">(${r.class_name})</span>` },
    { key: 'tracking_code', label: 'Tracking Code', render: (r) => `<span class="mono">${r.tracking_code}</span>` },
    { key: 'method', label: 'Network', render: (r) => (r.method === 'MTN_MOMO' ? 'MTN MoMo' : 'Orange Money') },
    { key: 'transaction_reference', label: 'Transaction ID', render: (r) => `<span class="mono">${r.transaction_reference}</span>` },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
    { key: 'notes', label: 'Submitted By', render: (r) => r.notes || '—' },
    { key: 'actions', label: '', render: (r) => `
      <button class="btn btn-sm btn-primary" data-confirm="${r.id}" data-name="${r.first_name} ${r.last_name}" data-amount="${r.amount}">Confirm</button>
      <button class="btn btn-sm btn-outline" data-reject="${r.id}" data-name="${r.first_name} ${r.last_name}">Reject</button>` },
  ], { emptyMessage: 'No payments awaiting verification — all caught up.' });

  qs('#summaryBanner').textContent = `${rows.length} payment${rows.length === 1 ? '' : 's'} awaiting verification`;

  qs('#tableMount').onclick = async (e) => {
    const confirmBtn = e.target.closest('[data-confirm]');
    if (confirmBtn) {
      if (!window.confirm(`Confirm ${formatCurrency(confirmBtn.dataset.amount)} was really received from ${confirmBtn.dataset.name}?`)) return;
      await api.post(`/payments/manual/${confirmBtn.dataset.confirm}/confirm`, {});
      await load();
      return;
    }
    const rejectBtn = e.target.closest('[data-reject]');
    if (rejectBtn) {
      openFormModal({
        title: `Reject Payment — ${rejectBtn.dataset.name}`,
        submitLabel: 'Reject',
        fields: [{ name: 'reason', label: 'Reason', type: 'textarea', full: true, placeholder: 'e.g. transaction ID does not match any received payment' }],
        onSubmit: async (v) => { await api.post(`/payments/manual/${rejectBtn.dataset.reject}/reject`, { reason: v.reason }); await load(); },
      });
    }
  };
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'pending-payments' });
  qs('#pageRoot').innerHTML = '<div class="text-muted" id="summaryBanner" style="margin-bottom:12px;"></div><div id="tableMount"></div>';
  await load();
}
main();
