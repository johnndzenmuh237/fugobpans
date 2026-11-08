import { api } from './api.js';
import { escapeHtml, formatCurrency, formatDate, formatDateTime, toast, statusBadge } from './utils.js';
import { renderSchedule } from './schedule-view.js';

/** Downloads the PDF report card through the authenticated API (the browser cannot send the cookie via a plain link across origins). */
export async function downloadReportCard(studentId, term = '') {
  const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/report-card/${studentId}/pdf${term ? `?term=${encodeURIComponent(term)}` : ''}`, { credentials: 'include' });
  if (!res.ok) { toast('Could not generate the report card.', 'error'); return; }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = 'report-card.pdf'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export function resultsHtml(results, studentId) {
  const terms = [...new Set(results.map((r) => r.term))];
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
      <select id="rcTerm"><option value="">All terms</option>${terms.map((t) => `<option>${escapeHtml(t)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" id="rcBtn" data-student="${studentId}" ${results.length ? '' : 'disabled'}>Download report card (PDF)</button></div>
    <div class="table-wrap"><table><thead><tr><th>Session</th><th>Subject</th><th>Term</th><th>Score</th><th>%</th><th>Remarks</th></tr></thead><tbody>
    ${results.map((r) => `<tr><td>${escapeHtml(r.session_name || '')}</td><td>${escapeHtml(r.subject_name)}</td><td>${escapeHtml(r.term)}</td><td><strong>${r.score}</strong> / ${r.max_score}</td><td>${Math.round((r.score / r.max_score) * 1000) / 10}%</td><td>${escapeHtml(r.remarks || '')}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">No published results yet. Results appear here once the school has approved them.</div></td></tr>'}
    </tbody></table></div>`;
}
export function wireResults(container) {
  container.querySelector('#rcBtn')?.addEventListener('click', (e) => downloadReportCard(e.currentTarget.dataset.student, container.querySelector('#rcTerm').value));
}

export async function attendanceHtml(studentId) {
  const a = await api.get(`/student-attendance/student/${studentId}`);
  return `<div class="stat-grid"><div class="stat-link"><div class="num">${a.attendanceRate === null ? 'n/a' : a.attendanceRate + '%'}</div><div class="lbl">Attendance (last 90 days)</div></div>
    <div class="stat-link"><div class="num">${a.summary.PRESENT}</div><div class="lbl">Present</div></div><div class="stat-link"><div class="num">${a.summary.LATE}</div><div class="lbl">Late</div></div>
    <div class="stat-link"><div class="num">${a.summary.ABSENT}</div><div class="lbl">Absent</div></div><div class="stat-link"><div class="num">${a.summary.EXCUSED}</div><div class="lbl">Excused</div></div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead><tbody>${a.records.slice(0, 60).map((r) => `<tr><td>${formatDate(r.attendance_date)}</td><td>${statusBadge(r.status)}</td><td>${escapeHtml(r.note || '')}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty-state">No attendance recorded yet.</div></td></tr>'}</tbody></table></div>`;
}

export function feesHtml(fees) {
  return `<div class="invoice-summary"><div class="item"><div class="text-muted">Total fees</div><div class="amt">${formatCurrency(fees.totalDue)}</div></div><div class="item"><div class="text-muted">Paid</div><div class="amt">${formatCurrency(fees.totalPaid)}</div></div><div class="item"><div class="text-muted">Outstanding</div><div class="amt">${formatCurrency(fees.balance)}</div></div></div>
    <h4>Invoices</h4><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>${fees.invoices.map((i) => `<tr><td class="mono">${escapeHtml(i.invoice_number)}</td><td>${formatCurrency(i.total_amount)}</td><td>${formatCurrency(i.amount_paid)}</td><td>${formatCurrency(i.balance)}</td><td>${statusBadge(i.status)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">No invoices yet.</div></td></tr>'}</tbody></table></div>
    <h4 style="margin-top:16px;">Payment history</h4><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead><tbody>${fees.payments.map((p) => `<tr><td class="mono">${escapeHtml(p.receipt_number || '—')}</td><td>${formatCurrency(p.amount)}</td><td>${escapeHtml(String(p.method).replace(/_/g, ' '))}</td><td>${formatDateTime(p.paid_at || p.created_at)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">No payments recorded yet.</div></td></tr>'}</tbody></table></div>`;
}

export const scheduleHtml = (slots) => renderSchedule(slots);

export async function announcementsHtml() {
  const rows = await api.get('/announcements/mine').catch(() => []);
  return rows.length ? rows.map((a) => `<div class="card card-pad" style="margin-bottom:8px;">${a.pinned ? '<span class="badge badge-warning">Pinned</span> ' : ''}<strong>${escapeHtml(a.title)}</strong><div class="text-muted" style="font-size:.78rem;">${formatDateTime(a.created_at)}</div><div style="margin-top:6px;white-space:pre-wrap;">${escapeHtml(a.body)}</div></div>`).join('') : '<div class="empty-state">No announcements right now.</div>';
}
