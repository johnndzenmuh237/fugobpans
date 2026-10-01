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
    const res = await fetch(`${API}/lookup/student/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Not found.');
    render(mount, data);
  } catch (err) {
    mount.innerHTML = `<div class="card card-pad" style="text-align:center;color:var(--danger-600,#c62828);">${escapeHtml(err.message || 'Could not find a record for that code.')}</div>`;
  }
});

function render(mount, data) {
  const { profile, fees, results, notes } = data;
  mount.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <h2 style="margin-top:0;">${escapeHtml(profile.name)}</h2>
      <p class="text-muted" style="margin:0;">${escapeHtml(profile.className)} · ${escapeHtml(profile.sessionName)} · Guardian: ${escapeHtml(profile.guardianName)}</p>
    </div>

    <div class="card card-pad" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">Fees</h3>
      <div class="invoice-summary" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">
        <div class="item"><div class="text-muted">Total Due</div><div class="amt">${money(fees.totalDue)}</div></div>
        <div class="item"><div class="text-muted">Paid</div><div class="amt">${money(fees.totalPaid)}</div></div>
        <div class="item"><div class="text-muted">Balance</div><div class="amt">${money(fees.balance)}</div></div>
      </div>
      <p style="text-align:center;font-weight:700;color:${fees.complete ? 'var(--success-600,#1a7f37)' : 'var(--amber-600,#b45309)'};">
        ${fees.complete ? '✅ Fees fully paid' : fees.totalPaid > 0 ? '⏳ Partially paid — balance remaining' : '⚠️ No payment received yet'}
      </p>
      ${fees.invoices.map((inv) => `
        <div style="border-top:1px solid var(--border,#e5e7eb);padding-top:10px;margin-top:10px;font-size:.88rem;">
          <strong>${escapeHtml(inv.invoice_number)}</strong> — ${money(inv.total_amount)} total, ${money(inv.amount_paid)} paid
          <span class="text-muted">(${inv.status})</span>
        </div>`).join('')}
    </div>

    ${results.length ? `
    <div class="card card-pad" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">Results</h3>
      <div class="table-wrap"><table><thead><tr><th>Subject</th><th>Term</th><th>Score</th></tr></thead><tbody>
        ${results.map((r) => `<tr><td>${escapeHtml(r.subject_name)}</td><td>${escapeHtml(r.term)}</td><td>${r.score ?? '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>` : ''}

    ${notes.length ? `
    <div class="card card-pad">
      <h3 style="margin-top:0;">Teacher Notes</h3>
      ${notes.map((n) => `
        <div style="border-bottom:1px solid var(--border,#e5e7eb);padding:10px 0;">
          <span class="badge ${n.type === 'COMPLAINT' ? 'badge-danger' : n.type === 'COMMENDATION' ? 'badge-success' : 'badge-neutral'}">${n.type}</span>
          <span class="text-muted" style="font-size:.78rem;float:right;">${formatDate(n.created_at)}</span>
          <p style="margin:8px 0 0;">${escapeHtml(n.note)}</p>
        </div>`).join('')}
    </div>` : ''}
  `;
}
