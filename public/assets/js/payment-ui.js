import { escapeHtml, formatDateTime, formatCurrency, toast } from './utils.js';
import { api } from './api.js';

const API = () => window.APP_CONFIG.API_BASE_URL;

function modal(title, bodyHtml, wide = false) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="modal" style="${wide ? 'max-width:760px;width:100%;' : ''}max-height:90vh;overflow:auto;"><div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="btn btn-ghost btn-sm" data-close aria-label="Close">&times;</button></div>${bodyHtml}</div>`;
  document.body.appendChild(el);
  const close = () => { el.querySelectorAll('img[data-blob]').forEach((i) => URL.revokeObjectURL(i.src)); el.remove(); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  return el;
}

/** The screenshot is fetched with the staff session cookie (never a public URL) and shown from a temporary blob. */
export async function showEvidence(paymentId, title = 'Payment screenshot') {
  const el = modal(title, '<div class="spinner" style="margin:30px auto;"></div>', true);
  try {
    const res = await fetch(`${API()}/payments/manual/${paymentId}/evidence`, { credentials: 'include' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No screenshot available.');
    const url = URL.createObjectURL(await res.blob());
    el.querySelector('.spinner').outerHTML = `<img data-blob src="${url}" alt="Payment screenshot" style="max-width:100%;border:1px solid #ddd;border-radius:8px;" />
      <p class="text-muted" style="font-size:.82rem;">Check: transaction ID, amount, date/time and the sender's number match what was typed — and that the money is really on the school's MoMo/Orange account.</p>`;
  } catch (e) { el.querySelector('.spinner').outerHTML = `<p style="color:#c62828;">${escapeHtml(e.message)}</p>`; }
}

const EVENT_LABEL = { SUBMITTED: 'Submitted', VERIFIED: 'Verified (money confirmed)', REJECTED: 'Rejected', INFO_REQUESTED: 'More information requested', RECORDED: 'Recorded by staff', GATEWAY_CONFIRMED: 'Confirmed by payment gateway', FLAGGED: 'Flagged' };
const EVENT_COLOR = { VERIFIED: '#1a7f37', RECORDED: '#1a7f37', GATEWAY_CONFIRMED: '#1a7f37', REJECTED: '#c62828', FLAGGED: '#b45309', INFO_REQUESTED: '#b45309', SUBMITTED: '#555' };
export const eventLabel = (e) => EVENT_LABEL[e] || e;
export const eventColor = (e) => EVENT_COLOR[e] || '#555';

export async function showHistory(paymentId) {
  const el = modal('Verification history', '<div class="spinner" style="margin:30px auto;"></div>', true);
  try {
    const rows = await api.get(`/payments/manual/${paymentId}/history`);
    el.querySelector('.spinner').outerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>What happened</th><th>Who</th><th>Amount</th><th>Note</th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td>${formatDateTime(r.created_at)}</td><td><strong style="color:${eventColor(r.event)}">${escapeHtml(eventLabel(r.event))}</strong>${r.receipt_number ? `<br><span class="mono">${escapeHtml(r.receipt_number)}</span>` : ''}</td>
      <td>${escapeHtml(r.actor_name)}<br><span class="text-muted" style="font-size:.74rem;">${escapeHtml(r.actor_role || '')}${r.ip ? ` · ${escapeHtml(r.ip)}` : ''}</span></td>
      <td>${r.amount === null ? '—' : formatCurrency(r.amount)}</td><td style="max-width:240px;">${escapeHtml(r.note || '')}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-muted" style="font-size:.78rem;">This record cannot be edited or deleted.</p>` : '<p class="text-muted">No history recorded.</p>';
  } catch (e) { el.querySelector('.spinner').outerHTML = `<p style="color:#c62828;">${escapeHtml(e.message)}</p>`; }
}

export { toast };
