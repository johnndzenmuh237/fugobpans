import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatCurrency, formatDateTime, escapeHtml, qs } from './utils.js';
import { eventLabel, eventColor, showHistory, showEvidence } from './payment-ui.js';

async function load() {
  const p = new URLSearchParams();
  for (const k of ['from', 'to', 'event', 'q']) { const v = qs(`#f_${k}`).value.trim(); if (v) p.set(k, v); }
  const rows = await api.get(`/payments/manual/history?${p}`);
  renderTable(qs('#tableMount'), rows, [
    { key: 'created_at', label: 'Date & time', render: (r) => formatDateTime(r.created_at) },
    { key: 'event', label: 'Action', render: (r) => `<strong style="color:${eventColor(r.event)}">${escapeHtml(eventLabel(r.event))}</strong>` },
    { key: 'actor_name', label: 'By', render: (r) => `${escapeHtml(r.actor_name)}<br><span class="text-muted" style="font-size:.74rem;">${escapeHtml(r.actor_role || '')}</span>` },
    { key: 'student', label: 'Student', render: (r) => `${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}<br><span class="text-muted mono" style="font-size:.74rem;">${escapeHtml(r.student_code)}</span>` },
    { key: 'amount', label: 'Amount', render: (r) => (r.amount === null ? '—' : formatCurrency(r.amount)) },
    { key: 'tx', label: 'Transaction / Receipt', render: (r) => `<span class="mono">${escapeHtml(r.transaction_reference)}</span>${r.receipt_number ? `<br><span class="mono">${escapeHtml(r.receipt_number)}</span>` : ''}` },
    { key: 'note', label: 'Note', render: (r) => `<span style="font-size:.82rem;">${escapeHtml(r.note || '')}</span>` },
    { key: 'a', label: '', render: (r) => `<button class="btn btn-sm btn-ghost" data-h="${r.payment_id}">Full trail</button> <button class="btn btn-sm btn-ghost" data-e="${r.payment_id}">Screenshot</button>` },
  ], { emptyMessage: 'No history matches these filters.', pageSize: 20 });
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'payment-history' });
  qs('#pageRoot').innerHTML = `<div class="card card-pad" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px;">
    <div class="field"><label>From</label><input id="f_from" type="date" /></div><div class="field"><label>To</label><input id="f_to" type="date" /></div>
    <div class="field"><label>Action</label><select id="f_event"><option value="">All</option>${['SUBMITTED', 'VERIFIED', 'REJECTED', 'INFO_REQUESTED', 'RECORDED', 'GATEWAY_CONFIRMED', 'FLAGGED'].map((e) => `<option value="${e}">${eventLabel(e)}</option>`).join('')}</select></div>
    <div class="field" style="flex:1;min-width:180px;"><label>Search</label><input id="f_q" placeholder="Student, transaction ID, receipt…" /></div>
    <button class="btn btn-primary" id="apply">Apply</button></div><div id="tableMount"></div>`;
  qs('#apply').onclick = () => load();
  qs('#tableMount').onclick = (e) => { const h = e.target.closest('[data-h]'); if (h) showHistory(h.dataset.h); const s = e.target.closest('[data-e]'); if (s) showEvidence(s.dataset.e); };
  await load().catch(() => {});
}
main();
