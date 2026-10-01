const API = window.APP_CONFIG.API_BASE_URL;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) { return `${Math.round(Number(n)).toLocaleString()} FCFA`; }
function formatDate(iso) { return iso ? new Date(iso).toLocaleDateString() : '—'; }

document.getElementById('lookupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  const mount = document.getElementById('resultMount');
  mount.innerHTML = '<div class="spinner" style="margin:30px auto;"></div>';
  try {
    const res = await fetch(`${API}/lookup/employee/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Not found.');
    render(mount, data);
  } catch (err) {
    mount.innerHTML = `<div class="card card-pad" style="text-align:center;color:var(--danger-600,#c62828);">${escapeHtml(err.message || 'Could not find a record for that code.')}</div>`;
  }
});

function render(mount, data) {
  const { profile, payrollHistory, leaveRequests } = data;
  mount.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <h2 style="margin-top:0;">${escapeHtml(profile.name)}</h2>
      <p class="text-muted" style="margin:0;">${escapeHtml(profile.positionName || '—')} ${profile.departmentName ? '· ' + escapeHtml(profile.departmentName) : ''} · Since ${formatDate(profile.startDate)}</p>
    </div>

    <div class="card card-pad" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">Salary History</h3>
      ${payrollHistory.length ? `<div class="table-wrap"><table><thead><tr><th>Period</th><th>Salary</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
        ${payrollHistory.map((p) => `<tr><td>${escapeHtml(p.period)}</td><td>${money(p.net_salary)}</td><td>${money(p.amount_paid)}</td><td>${money(p.balance)}</td><td>${escapeHtml(p.status)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="text-muted">No payroll history yet.</p>'}
    </div>

    <div class="card card-pad">
      <h3 style="margin-top:0;">Leave Requests</h3>
      ${leaveRequests.length ? leaveRequests.map((l) => `
        <div style="border-bottom:1px solid var(--border,#e5e7eb);padding:10px 0;">
          <strong>${formatDate(l.start_date)} → ${formatDate(l.end_date)}</strong> — ${escapeHtml(l.leave_type)}
          <span class="badge ${l.status === 'APPROVED' ? 'badge-success' : l.status === 'DECLINED' ? 'badge-danger' : 'badge-neutral'}" style="margin-left:8px;">${l.status}</span>
          ${l.decision_note ? `<p class="text-muted" style="margin:6px 0 0;">Note: ${escapeHtml(l.decision_note)}</p>` : ''}
        </div>`).join('') : '<p class="text-muted">No leave requests yet.</p>'}
    </div>
  `;
}
