import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, formatDate, statusBadge, escapeHtml, toast, qs } from './utils.js';
import { openFormModal } from './crud-table.js';
import { fmtCell } from './ui.js';
import { attendanceHtml } from './portal-sections.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'students' });
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { qs('#pageRoot').innerHTML = '<div class="empty-state">No student selected.</div>'; return; }

  const s = await api.get(`/students/${id}`);
  const totalFees = s.invoices.reduce((sum, i) => sum + Number(i.total_amount), 0);
  const totalPaid = s.invoices.reduce((sum, i) => sum + Number(i.amount_paid), 0);

  qs('#pageActions').innerHTML = `<button id="editBtn" class="btn btn-outline">Edit details</button> <button id="lifeBtn" class="btn btn-outline">Promote / transfer / withdraw</button> <button id="discBtn" class="btn btn-outline">Add disciplinary record</button> <button id="createLoginBtn" class="btn btn-outline">Create Student Portal Login</button>`;

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
        <div class="table-wrap"><table><thead><tr><th>Session</th><th>Class</th><th>Subject</th><th>Term</th><th>Score</th><th>Status</th></tr></thead><tbody>
          ${(s.results || []).map((r) => `<tr><td>${escapeHtml(r.session_name || '')}</td><td>${escapeHtml(r.class_name || '')}</td><td>${escapeHtml(r.subject_name)}</td><td>${escapeHtml(r.term)}</td><td><strong>${r.score}</strong> / ${r.max_score}</td><td>${statusBadge(r.status === 'SUBMITTED' ? 'PENDING' : r.status === 'APPROVED' ? 'ACTIVE' : r.status)}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty-state">No results entered yet.</div></td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;

  // ---- History, attendance, discipline (additive sections)
  const [classes, sessions, discipline] = await Promise.all([api.get('/academics/classes'), api.get('/academics/sessions'), api.get(`/students/${id}/discipline`).catch(() => [])]);
  const grid = qs('#pageRoot .form-grid');
  const extra = document.createElement('div');
  extra.className = 'form-row-full';
  extra.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;"><h3>Class &amp; status history</h3>
      <p class="text-muted" style="font-size:.82rem;">Every move is kept permanently. Earlier results stay linked to the class and session they were earned in.</p>
      <div class="table-wrap"><table><thead><tr><th>When</th><th>Event</th><th>Class</th><th>Session</th><th>By</th><th>Note</th></tr></thead><tbody>
      ${(s.history || []).map((h) => `<tr><td>${fmtCell('created_at', h.created_at)}</td><td>${escapeHtml(String(h.event_type).replace(/_/g, ' '))}</td><td>${escapeHtml(h.from_class ? `${h.from_class} → ${h.to_class}` : (h.to_class || ''))}</td><td>${escapeHtml(h.from_session && h.from_session !== h.to_session ? `${h.from_session} → ${h.to_session}` : (h.to_session || ''))}</td><td>${escapeHtml(h.changed_by_name || 'System')}</td><td>${escapeHtml(h.note || '')}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card card-pad" style="margin-bottom:16px;"><h3>Attendance</h3><div id="attBox"><div class="spinner"></div></div></div>
    <div class="card card-pad"><h3>Disciplinary records</h3>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Severity</th><th>Category</th><th>Description</th><th>Action taken</th><th>Recorded by</th></tr></thead><tbody>
      ${discipline.map((d) => `<tr><td>${fmtCell('incident_date', d.incident_date)}</td><td>${escapeHtml(d.severity)}</td><td>${escapeHtml(d.category || '')}</td><td>${escapeHtml(d.description)}</td><td>${escapeHtml(d.action_taken || '')}</td><td>${escapeHtml(d.recorded_by_name || '')}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">No disciplinary records.</div></td></tr>'}
      </tbody></table></div></div>`;
  grid.appendChild(extra);
  attendanceHtml(id).then((h) => { qs('#attBox').innerHTML = h; }).catch(() => { qs('#attBox').innerHTML = '<p class="text-muted">Unavailable.</p>'; });

  const opt = (list) => list.map((x) => ({ value: x.id, label: x.name }));
  qs('#editBtn').addEventListener('click', () => openFormModal({
    title: 'Edit student details', initial: { first_name: s.first_name, middle_name: s.middle_name, last_name: s.last_name, date_of_birth: String(s.date_of_birth).slice(0, 10), gender: s.gender, guardian_name: s.guardian_name, guardian_relationship: s.guardian_relationship, guardian_phone: s.guardian_phone, guardian_whatsapp: s.guardian_whatsapp, guardian_email: s.guardian_email, guardian_address: s.guardian_address },
    fields: [{ name: 'first_name', label: 'First name', required: true }, { name: 'middle_name', label: 'Middle name' }, { name: 'last_name', label: 'Last name', required: true }, { name: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
      { name: 'gender', label: 'Gender', type: 'select', required: true, options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }] },
      { name: 'guardian_name', label: 'Guardian name', required: true }, { name: 'guardian_relationship', label: 'Relationship' }, { name: 'guardian_phone', label: 'Guardian phone', required: true }, { name: 'guardian_whatsapp', label: 'WhatsApp' }, { name: 'guardian_email', label: 'Email', type: 'email' }, { name: 'guardian_address', label: 'Address', full: true }],
    onSubmit: async (v) => { await api.patch(`/students/${id}`, v); toast('Student updated.', 'success'); setTimeout(() => location.reload(), 600); },
  }));
  qs('#lifeBtn').addEventListener('click', () => openFormModal({
    title: 'Promote, move, transfer or withdraw',
    fields: [{ name: 'action', label: 'Action', type: 'select', required: true, options: [{ value: 'PROMOTE', label: 'Promote to a new class & session' }, { value: 'CHANGE_CLASS', label: 'Move to another class (same session)' }, { value: 'GRADUATE', label: 'Graduate' }, { value: 'TRANSFER_OUT', label: 'Transfer to another school' }, { value: 'WITHDRAW', label: 'Withdraw' }, { value: 'REINSTATE', label: 'Reinstate as active' }] },
      { name: 'classId', label: 'New class (promote / move only)', type: 'select', options: opt(classes) }, { name: 'academicSessionId', label: 'New academic session (promote only)', type: 'select', options: opt(sessions) }, { name: 'note', label: 'Note', type: 'textarea', full: true }],
    submitLabel: 'Apply',
    onSubmit: async (v) => { await api.post(`/students/${id}/lifecycle`, { action: v.action, classId: v.classId || undefined, academicSessionId: v.academicSessionId || undefined, note: v.note }); toast('Done. The student and parents have been notified where relevant.', 'success'); setTimeout(() => location.reload(), 700); },
  }));
  qs('#discBtn').addEventListener('click', () => openFormModal({
    title: 'Add disciplinary record',
    fields: [{ name: 'incidentDate', label: 'Date', type: 'date' }, { name: 'severity', label: 'Severity', type: 'select', required: true, options: [{ value: 'MINOR', label: 'Minor' }, { value: 'MAJOR', label: 'Major' }, { value: 'SEVERE', label: 'Severe' }] }, { name: 'category', label: 'Category' },
      { name: 'description', label: 'What happened', type: 'textarea', required: true, full: true }, { name: 'actionTaken', label: 'Action taken', type: 'textarea', full: true }],
    onSubmit: async (v) => { await api.post(`/students/${id}/discipline`, v); toast('Recorded.', 'success'); setTimeout(() => location.reload(), 600); },
  }));

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
