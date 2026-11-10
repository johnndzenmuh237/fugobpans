import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDateTime, escapeHtml, toast, qs } from './utils.js';
import { showEvidence, showHistory } from './payment-ui.js';

let rows = [];
async function load() {
  rows = await api.get('/payments/manual/pending');
  renderTable(qs('#tableMount'), rows, [
    { key: 'created_at', label: 'Submitted', render: (r) => formatDateTime(r.created_at) },
    { key: 'student', label: 'Student', render: (r) => `${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)} <span class="text-muted">(${escapeHtml(r.class_name)})</span><br><span class="text-muted" style="font-size:.76rem;">Guardian: ${escapeHtml(r.guardian_name || '—')} · <a href="tel:${escapeHtml(r.guardian_phone)}">${escapeHtml(r.guardian_phone)}</a></span>` },
    { key: 'method', label: 'Network', render: (r) => (r.method === 'MTN_MOMO' ? 'MTN MoMo' : 'Orange Money') },
    { key: 'transaction_reference', label: 'Transaction ID', render: (r) => `<span class="mono">${escapeHtml(r.transaction_reference)}</span><br><span class="text-muted" style="font-size:.76rem;">from ${escapeHtml(r.payer_phone || '—')}</span>` },
    { key: 'amount', label: 'Amount claimed', render: (r) => `${formatCurrency(r.amount)}<br><span class="text-muted" style="font-size:.76rem;">Balance ${formatCurrency(r.balance)}</span>` },
    { key: 'checks', label: 'Checks', render: (r) => [
      r.has_evidence ? `<button class="btn btn-sm btn-outline" data-evidence="${r.id}">View screenshot</button>` : '<span class="text-muted">No screenshot</span>',
      r.statement_line ? `<div style="color:#1a7f37;font-size:.76rem;margin-top:4px;">In imported statement: ${formatCurrency(r.statement_line.amount)}${Number(r.statement_line.amount) !== r.amount ? ' <strong style="color:#c62828;">(amount differs!)</strong>' : ''}</div>` : '',
      r.flags ? '<div style="color:#b45309;font-size:.76rem;margin-top:4px;">Flagged: same screenshot used before</div>' : '',
      r.info_requests ? `<div class="text-muted" style="font-size:.76rem;">Info requested ×${r.info_requests}</div>` : '',
    ].join('') },
    { key: 'actions', label: '', render: (r) => `<div style="display:flex;flex-direction:column;gap:6px;min-width:120px;">
      <button class="btn btn-sm btn-primary" data-confirm="${r.id}">Verify — money received</button>
      <button class="btn btn-sm btn-outline" data-info="${r.id}">Ask for information</button>
      <button class="btn btn-sm btn-outline" data-reject="${r.id}">Reject</button>
      <button class="btn btn-sm btn-ghost" data-history="${r.id}">History</button></div>` },
  ], { emptyMessage: 'No payments awaiting verification — all caught up.' });
  qs('#summaryBanner').textContent = `${rows.length} payment${rows.length === 1 ? '' : 's'} awaiting verification. A screenshot alone never credits a student — check the money is on the school's MoMo/Orange account first.`;
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'pending-payments' });
  qs('#pageRoot').innerHTML = '<div class="text-muted" id="summaryBanner" style="margin-bottom:12px;"></div><div id="tableMount"></div>';
  await load().catch(() => {});
  qs('#tableMount').onclick = async (e) => {
    const t = (a) => e.target.closest(`[${a}]`);
    const ev = t('data-evidence'); if (ev) return showEvidence(ev.dataset.evidence);
    const hi = t('data-history'); if (hi) return showHistory(hi.dataset.history);
    const c = t('data-confirm');
    if (c) {
      const r = rows.find((x) => x.id === c.dataset.confirm);
      return openFormModal({
        title: `Verify payment — ${r.first_name} ${r.last_name}`, submitLabel: 'Yes, the money is received',
        initial: { confirmedAmount: String(r.amount) },
        fields: [
          { name: 'confirmedAmount', label: `Amount actually received (claimed: ${formatCurrency(r.amount)})`, type: 'number', required: true },
          { name: 'note', label: 'Note (optional) — e.g. "seen on MTN merchant statement 14:32"', type: 'textarea', full: true },
        ],
        onSubmit: async (v) => { await api.post(`/payments/manual/${r.id}/confirm`, { confirmedAmount: Number(v.confirmedAmount), note: v.note || undefined }); toast('Payment verified. Receipt issued and your name recorded.', 'success'); await load(); },
      });
    }
    const i = t('data-info');
    if (i) return openFormModal({ title: 'Ask the family for more information', submitLabel: 'Send request', fields: [{ name: 'message', label: 'What should they send or correct?', type: 'textarea', full: true, required: true }],
      onSubmit: async (v) => { const r = await api.post(`/payments/manual/${i.dataset.info}/request-info`, { message: v.message }); toast(r.messageStatus === 'SENT' ? 'Request sent to the guardian.' : 'Request recorded. SMS/WhatsApp is not configured, so please call the guardian.', r.messageStatus === 'SENT' ? 'success' : 'info'); await load(); } });
    const x = t('data-reject');
    if (x) openFormModal({ title: 'Reject payment', submitLabel: 'Reject', fields: [{ name: 'reason', label: 'Reason (the family is told this)', type: 'textarea', full: true, required: true, placeholder: 'e.g. transaction ID does not match any received payment' }],
      onSubmit: async (v) => { await api.post(`/payments/manual/${x.dataset.reject}/reject`, { reason: v.reason }); toast('Payment rejected and recorded.', 'success'); await load(); } });
  };
}
main();
