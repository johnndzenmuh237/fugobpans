import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, formatDate, formatDateTime, statusBadge, escapeHtml, qs } from './utils.js';

async function main() {
  const profile = await initPortalLayout({ portal: 'STUDENT', activeKey: 'dashboard' });
  const s = await api.get('/students/me');
  const assignments = await api.get('/assignments/my-class').catch(() => []);

  const totalFees = s.invoices.reduce((sum, i) => sum + Number(i.total_amount), 0);
  const totalPaid = s.invoices.reduce((sum, i) => sum + Number(i.amount_paid), 0);

  qs('#pageRoot').innerHTML = `
    <div class="welcome-banner">
      <h1>Welcome, ${escapeHtml(s.first_name)}!</h1>
      <p style="color:rgba(255,255,255,.85);margin:0;">Student ID: <strong class="mono">${s.student_code}</strong> · Class: ${escapeHtml(s.class_name)} · ${statusBadge(s.status)}</p>
    </div>

    <div class="tabs">
      <button class="tab-btn is-active" data-tab="profile">My Profile</button>
      <button class="tab-btn" data-tab="fees">Fees &amp; Payments</button>
      <button class="tab-btn" data-tab="results">My Results</button>
      <button class="tab-btn" data-tab="assignments">Assignments</button>
    </div>

    <div data-tab-panel="profile" class="card card-pad">
      <div class="form-grid">
        <p><strong>Full name:</strong> ${escapeHtml(s.first_name)} ${escapeHtml(s.middle_name || '')} ${escapeHtml(s.last_name)}</p>
        <p><strong>Date of birth:</strong> ${formatDate(s.date_of_birth)}</p>
        <p><strong>Gender:</strong> ${escapeHtml(s.gender)}</p>
        <p><strong>Category:</strong> ${escapeHtml(s.category_name)}</p>
        <p><strong>Class:</strong> ${escapeHtml(s.class_name)}</p>
        <p><strong>Registration status:</strong> ${statusBadge(s.status)}</p>
        <p class="form-row-full"><strong>Guardian:</strong> ${escapeHtml(s.guardian_name)} (${escapeHtml(s.guardian_relationship || '—')}) · ${escapeHtml(s.guardian_phone)}</p>
      </div>
    </div>

    <div data-tab-panel="fees" class="card card-pad hidden">
      <div class="invoice-summary">
        <div class="item"><div class="text-muted">Total Fees</div><div class="amt">${formatCurrency(totalFees)}</div></div>
        <div class="item"><div class="text-muted">Paid</div><div class="amt">${formatCurrency(totalPaid)}</div></div>
        <div class="item"><div class="text-muted">Outstanding</div><div class="amt">${formatCurrency(totalFees - totalPaid)}</div></div>
      </div>
      <h4>Invoices</h4>
      <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
        ${s.invoices.map((i) => `<tr><td class="mono">${i.invoice_number}</td><td>${formatCurrency(i.total_amount)}</td><td>${formatCurrency(i.amount_paid)}</td><td>${formatCurrency(i.balance)}</td><td>${statusBadge(i.status)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">No invoices yet.</div></td></tr>'}
      </tbody></table></div>
      <h4 style="margin-top:18px;">Payment History</h4>
      <div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead><tbody>
        ${s.payments.map((p) => `<tr><td class="mono">${p.receipt_number || '—'}</td><td>${formatCurrency(p.amount)}</td><td>${p.method.replace('_', ' ')}</td><td>${formatDateTime(p.paid_at)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">No payments recorded yet.</div></td></tr>'}
      </tbody></table></div>
    </div>

    <div data-tab-panel="results" class="card card-pad hidden">
      <div class="table-wrap"><table><thead><tr><th>Subject</th><th>Term</th><th>Score</th></tr></thead><tbody>
        ${s.results.map((r) => `<tr><td>${escapeHtml(r.subject_name)}</td><td>${escapeHtml(r.term)}</td><td><strong>${r.score}</strong> / ${r.max_score}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty-state">No results have been entered yet.</div></td></tr>'}
      </tbody></table></div>
    </div>

    <div data-tab-panel="assignments" class="card card-pad hidden">
      ${assignments.length ? assignments.map((a) => `
        <div class="card card-pad" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <strong>${escapeHtml(a.title)}</strong>
            ${a.due_date ? `<span class="badge badge-warning">Due ${formatDate(a.due_date)}</span>` : ''}
          </div>
          <p class="text-muted" style="font-size:.82rem;margin:4px 0 8px;">${escapeHtml(a.class_name)}${a.subject_name ? ` · ${escapeHtml(a.subject_name)}` : ''}</p>
          ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
        </div>`).join('') : '<div class="empty-state">No assignments posted for your class yet.</div>'}
    </div>
  `;

  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.querySelectorAll('[data-tab-panel]').forEach((p) => p.classList.add('hidden'));
    document.querySelector(`[data-tab-panel="${btn.dataset.tab}"]`).classList.remove('hidden');
  }));

  // Support the sidebar's #fees / #results anchor links jumping straight to a tab.
  const hash = location.hash.replace('#', '');
  if (hash) document.querySelector(`.tab-btn[data-tab="${hash}"]`)?.click();
}
main();
