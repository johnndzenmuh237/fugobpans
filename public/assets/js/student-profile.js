import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, formatDate, statusBadge, escapeHtml, toast, qs } from './utils.js';
import { openFormModal } from './crud-table.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'students' });
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { qs('#pageRoot').innerHTML = '<div class="empty-state">No student selected.</div>'; return; }

  const s = await api.get(`/students/${id}`);
  const totalFees = s.invoices.reduce((sum, i) => sum + Number(i.total_amount), 0);
  const totalPaid = s.invoices.reduce((sum, i) => sum + Number(i.amount_paid), 0);

  qs('#pageActions').innerHTML = `<button id="createLoginBtn" class="btn btn-outline">Create Student Portal Login</button>`;

  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="margin-bottom:20px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
      <span class="avatar" style="width:64px;height:64px;font-size:1.3rem;">${(s.first_name || '?')[0]}${(s.last_name || '')[0] || ''}</span>
      <div><h2 style="margin-bottom:4px;">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</h2><div class="mono text-muted">${s.student_code}</div><div style="margin-top:6px;">${statusBadge(s.status)}</div></div>
    </div>
    <div class="form-grid">
      <div class="card card-pad"><h3>Personal</h3>
        <p><strong>DOB:</strong> ${formatDate(s.date_of_birth)}</p>
        <p><strong>Gender:</strong> ${escapeHtml(s.gender)}</p>
        <p><strong>Category:</strong> ${escapeHtml(s.category_name)}</p>
        <p><strong>Class:</strong> ${escapeHtml(s.class_name)}</p>
      </div>
      <div class="card card-pad"><h3>Guardian</h3>
        <p><strong>Name:</strong> ${escapeHtml(s.guardian_name)} (${escapeHtml(s.guardian_relationship || '—')})</p>
        <p><strong>Phone:</strong> ${escapeHtml(s.guardian_phone)}</p>
        <p><strong>WhatsApp:</strong> ${escapeHtml(s.guardian_whatsapp || '—')}</p>
        <p><strong>Email:</strong> ${escapeHtml(s.guardian_email || '—')}</p>
        <p><strong>Address:</strong> ${escapeHtml(s.guardian_address || '—')}</p>
      </div>
      <div class="card card-pad form-row-full"><h3>Finance</h3>
        <div class="invoice-summary">
          <div class="item"><div class="text-muted">Total Fees</div><div class="amt">${formatCurrency(totalFees)}</div></div>
          <div class="item"><div class="text-muted">Paid</div><div class="amt">${formatCurrency(totalPaid)}</div></div>
          <div class="item"><div class="text-muted">Outstanding</div><div class="amt">${formatCurrency(totalFees - totalPaid)}</div></div>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
          ${s.invoices.map((i) => `<tr><td class="mono">${i.invoice_number}</td><td>${formatCurrency(i.total_amount)}</td><td>${formatCurrency(i.amount_paid)}</td><td>${formatCurrency(i.balance)}</td><td>${statusBadge(i.status)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">No invoices.</div></td></tr>'}
        </tbody></table></div>
        <h4 style="margin-top:18px;">Payment History</h4>
        <div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead><tbody>
          ${s.payments.map((p) => `<tr><td class="mono">${p.receipt_number || '—'}</td><td>${formatCurrency(p.amount)}</td><td>${p.method.replace('_', ' ')}</td><td>${formatDate(p.paid_at)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">No payments yet.</div></td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card card-pad form-row-full"><h3>Exam Results</h3>
        <div class="table-wrap"><table><thead><tr><th>Subject</th><th>Term</th><th>Score</th></tr></thead><tbody>
          ${(s.results || []).map((r) => `<tr><td>${escapeHtml(r.subject_name)}</td><td>${escapeHtml(r.term)}</td><td><strong>${r.score}</strong> / ${r.max_score}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty-state">No results entered yet.</div></td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;

  qs('#createLoginBtn').addEventListener('click', () => openFormModal({
    title: 'Create Student Portal Login',
    fields: [
      { name: 'email', label: 'Login email (for the student/guardian)', type: 'email', required: true },
      { name: 'password', label: 'Temporary password', required: true },
    ],
    onSubmit: async (v) => { await api.post(`/students/${id}/login`, v); toast('Student login created.', 'success'); },
  }));
}
main();
