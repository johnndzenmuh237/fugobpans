const API = window.APP_CONFIG.API_BASE_URL;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) { return `${Math.round(Number(n)).toLocaleString()} FCFA`; }
function formatDate(iso) { return iso ? new Date(iso).toLocaleDateString() : '—'; }

async function loadAnnouncements() {
  const mount = document.getElementById('announcementsMount');
  try {
    const items = await fetch(`${API}/announcements/public`).then((r) => r.json());
    if (!items.length) { mount.innerHTML = '<p class="text-muted">No announcements posted yet.</p>'; return; }
    const top = items.slice(0, 5);
    mount.innerHTML = top.map((a) => `
      <div class="card card-pad" style="margin-bottom:10px;${a.pinned ? 'border-left:4px solid var(--accent, #6366f1);' : ''}">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <strong>${a.pinned ? '📌 ' : ''}${escapeHtml(a.title)}</strong>
          <span class="text-muted" style="font-size:.76rem;">${formatDate(a.created_at)}</span>
        </div>
        <p style="white-space:pre-wrap;margin:8px 0 0;">${escapeHtml(a.body)}</p>
      </div>`).join('') + (items.length > 5 ? `<a href="/announcements.html" class="text-muted" style="font-size:.85rem;">See all announcements →</a>` : '');
  } catch {
    mount.innerHTML = '<p class="text-muted">Could not load announcements right now.</p>';
  }
}
loadAnnouncements();

const tokenKey = (code) => `portalToken:${code}`;
const getToken = (code) => sessionStorage.getItem(tokenKey(code)) || '';

async function doLookup(code) {
  const mount = document.getElementById('resultMount');
  mount.innerHTML = '<div class="spinner" style="margin:30px auto;"></div>';
  try {
    const res = await fetch(`${API}/lookup/student/${encodeURIComponent(code)}`, { headers: { 'x-portal-token': getToken(code) } });
    const data = await res.json();
    if (res.status === 401 && data.otpRequired) { sessionStorage.removeItem(tokenKey(code)); return askForCode(mount, code); }
    if (!res.ok) throw new Error(data.error || 'Not found.');
    render(mount, data);
    attachPayment(mount, code, data);
  } catch (err) {
    mount.innerHTML = `<div class="card card-pad" style="text-align:center;color:var(--danger-600,#c62828);">${escapeHtml(err.message || 'Could not find a record for that code.')}</div>`;
  }
}

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/** The school has switched on identity verification: a code is sent to the guardian's registered phone first. */
async function askForCode(mount, code) {
  let info = '';
  try { info = (await postJson('/lookup/student-otp/request', { trackingCode: code })).message; } catch (e) { info = e.message; }
  mount.innerHTML = `<form id="otpForm" class="card card-pad" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
    <p class="form-row-full" style="flex-basis:100%;margin:0;">${escapeHtml(info)}</p>
    <div class="field" style="flex:1;min-width:180px;"><label>6-digit code</label><input id="otpInput" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required placeholder="123456" /></div>
    <button class="btn btn-accent" type="submit">Verify</button></form><div id="otpMsg" style="color:#c62828;margin-top:8px;"></div>`;
  document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await postJson('/lookup/student-otp/verify', { trackingCode: code, code: document.getElementById('otpInput').value.trim() });
      sessionStorage.setItem(tokenKey(code), r.accessToken);
      doLookup(code);
    } catch (err) { document.getElementById('otpMsg').textContent = err.message; }
  });
}

const readFile = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Could not read the image.')); r.readAsDataURL(f); });

/** Parent pays by MTN/Orange outside the site, then sends proof here. It becomes PENDING — never confirmed until the school checks. */
function attachPayment(mount, code, data) {
  if (!(data.fees.balance > 0)) return;
  const box = document.createElement('div');
  box.className = 'card card-pad';
  box.style.marginTop = '18px';
  box.innerHTML = `<h3 style="margin-top:0;">Paid by Mobile Money? Send your proof</h3>
    <p class="text-muted" style="font-size:.88rem;">After you pay the school's MTN Mobile Money or Orange Money number, enter the details and attach the confirmation screenshot. <strong>Your payment is only confirmed once the school sees the money on its account</strong> — until then it shows as "waiting for verification".</p>
    <form id="payForm"><div class="form-grid">
      <div class="field"><label>Network</label><select name="provider" required><option value="">Select…</option><option value="MTN_MOMO">MTN Mobile Money</option><option value="ORANGE_MONEY">Orange Money</option></select></div>
      <div class="field"><label>Amount you sent (FCFA)</label><input name="amount" type="number" min="1" max="${Math.round(data.fees.balance)}" required /></div>
      <div class="field"><label>Transaction ID</label><input name="transactionId" required minlength="6" maxlength="40" autocomplete="off" /></div>
      <div class="field"><label>Phone you paid from</label><input name="payerPhone" type="tel" required /></div>
      <div class="field form-row-full"><label>Screenshot of the confirmation (JPG/PNG, max 4 MB) — it must show date, time, transaction ID and amount</label><input name="evidence" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
    </div><button class="btn btn-accent" type="submit">Submit payment proof</button><div id="payMsg" style="margin-top:10px;" role="status" aria-live="polite"></div></form>`;
  mount.appendChild(box);
  box.querySelector('#payForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, msg = box.querySelector('#payMsg'), btn = f.querySelector('button');
    const file = f.evidence.files[0];
    if (!file) { msg.textContent = 'Please attach the screenshot.'; return; }
    if (file.size > 4 * 1024 * 1024) { msg.style.color = '#c62828'; msg.textContent = 'The screenshot is larger than 4 MB. Choose a smaller image.'; return; }
    btn.disabled = true; msg.style.color = ''; msg.textContent = 'Sending…';
    try {
      const r = await postJson('/public-payments/submit', { trackingCode: code, provider: f.provider.value, amount: Number(f.amount.value), transactionId: f.transactionId.value.trim(), payerPhone: f.payerPhone.value.trim(), evidence: await readFile(file), accessToken: getToken(code) });
      msg.style.color = '#1a7f37'; msg.textContent = r.message; f.reset();
    } catch (err) { msg.style.color = '#c62828'; msg.textContent = err.message; } finally { btn.disabled = false; }
  });
}

document.getElementById('lookupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  doLookup(document.getElementById('codeInput').value.trim().toUpperCase());
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
          <span class="text-muted">(${inv.status})</span>${(inv.payments || []).filter((p) => p.status === 'PENDING').map((p) => `<div style="font-size:.82rem;color:#b45309;">Waiting for verification: ${money(p.amount)} (ID ${escapeHtml(p.transaction_reference)})</div>`).join('')}
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
