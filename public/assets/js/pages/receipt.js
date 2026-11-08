import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { downloadFile } from '../crud-table.js';
import { qs, escapeHtml, formatDate, formatDateTime, METHOD_LABEL } from '../utils.js';
import { param } from './_common.js';

const n = (v) => Math.round(Number(v || 0)).toLocaleString('en-US');
async function main() {
  await initPortalLayout({ activeKey: 'payments', title: 'Receipt', subtitle: 'View, download, print or send.' });
  const id = param('id');
  const r = await api.get(`/payments/${id}/receipt`);
  const cur = r.company.currency || 'FCFA';
  const row = (k, v) => `<div class="row"><span>${k}</span><strong>${v}</strong></div>`;
  qs('#pageRoot').innerHTML = `
    <div class="no-print" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:18px">
      <button class="btn btn-primary" onclick="print()">Print</button><button class="btn btn-outline" id="pdfBtn">Download PDF</button>
      <a class="btn btn-outline" id="waBtn" target="_blank" rel="noopener">Send via WhatsApp</a><a class="btn btn-outline" id="mailBtn">Send by email</a></div>
    <div class="receipt"><div class="receipt-head"><h2>${escapeHtml(r.company.name || 'Receipt')}</h2><div style="opacity:.8;font-size:.82rem">${escapeHtml([r.company.address, r.company.phone].filter(Boolean).join(' • '))}</div></div>
      <div class="receipt-body"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong>RECEIPT</strong><span class="mono">${escapeHtml(r.receiptNumber)}</span></div>
      ${row('Date', formatDateTime(r.paidAt))}${row('Tenant', `${escapeHtml(r.tenantName)} (${escapeHtml(r.tenantCode)})`)}${row('Property', escapeHtml(r.propertyName))}
      ${row('House / Unit', `House ${escapeHtml(r.houseNo)} · Unit ${escapeHtml(r.unitNo)}${r.categoryName ? ` · ${escapeHtml(r.categoryName)}` : ''}`)}
      ${row('Payment type', r.type === 'RENT' ? 'Rent' : r.type === 'DEPOSIT' ? 'Security deposit' : 'Other')}${row('Amount paid', `${n(r.amount)} ${cur}`)}
      ${r.type === 'RENT' ? `${row('Months covered', r.monthsCovered)}${row('Period covered', `${formatDate(r.periodFrom)} → ${formatDate(r.periodTo)}`)}${row('Previous balance', `${n(r.previousBalance)} ${cur}`)}${row('Remaining balance', `${n(r.remainingBalance)} ${cur}`)}${row('Next payment date', formatDate(r.nextPaymentDate))}` : ''}
      ${row('Method', escapeHtml(METHOD_LABEL[r.method] || r.method))}${row('Reference', `<span class="mono">${escapeHtml(r.transactionReference)}</span>`)}${row('Authorized by', escapeHtml(r.authorizedBy))}${row('Status', '<span class="badge badge-success">Confirmed</span>')}
      <p class="text-muted" style="font-size:.76rem;margin:14px 0 0">Computer-generated receipt. Keep it as proof of payment.</p></div></div>`;
  const msg = `Receipt ${r.receiptNumber}: ${n(r.amount)} ${cur} received from ${r.tenantName} for ${r.propertyName}, House ${r.houseNo} Unit ${r.unitNo}. Next payment: ${formatDate(r.nextPaymentDate)}. Thank you.`;
  qs('#waBtn').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  qs('#mailBtn').href = `mailto:?subject=${encodeURIComponent(`Receipt ${r.receiptNumber}`)}&body=${encodeURIComponent(msg)}`;
  qs('#pdfBtn').addEventListener('click', () => downloadFile(api.url(`/payments/${id}/receipt?format=pdf`), `${r.receiptNumber}.pdf`));
}
main();
