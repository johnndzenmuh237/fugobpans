/**
 * Tenant dashboard.
 *  - Before a code is entered: only GENERAL announcements (public) are shown.
 *  - After a tracking code (+ last 4 phone digits) is verified: ONLY that tenant's
 *    data loads — rent, receipts, contract, payments, maintenance, and announcements
 *    targeted at their house category / property.
 * The portal token lives in sessionStorage (closes with the tab) and expires after 2h.
 */
import { api } from '../api.js';
import { escapeHtml, formatCurrency, formatDate, formatDateTime, statusBadge, METHOD_LABEL, toast } from '../utils.js';

const TOKEN_KEY = 'fp_portal_token';
const API = () => window.APP_CONFIG.API_BASE_URL;
let token = sessionStorage.getItem(TOKEN_KEY);
let me = null; let anns = []; let tab = 'overview';
const $ = (s) => document.querySelector(s);
const call = (path, o = {}) => api.get(path, { silent: true, portalToken: token, ...o });
const post = (path, body) => api.post(path, body, { silent: true, portalToken: token });

function noticeHtml(a, showAudience) {
  const tag = showAudience && a.audience !== 'ALL' ? `<span class="badge badge-info" style="margin-left:8px">${a.audience === 'CATEGORY' ? `For ${escapeHtml(a.category_name)} tenants` : `For ${escapeHtml(a.property_name)}`}</span>` : '';
  return `<div class="notice-card k-${a.kind}"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><strong>${a.pinned ? '📌 ' : ''}${escapeHtml(a.title)}${tag}</strong>${a.kind === 'URGENT' ? '<span class="badge badge-danger">Urgent</span>' : ''}</div><div style="margin:6px 0;white-space:pre-wrap">${escapeHtml(a.body)}</div><div class="text-muted" style="font-size:.76rem">${formatDate(a.created_at)}</div></div>`;
}

async function loadGeneralBoard() {
  try {
    const rows = await fetch(`${API()}/announcements/public`).then((r) => r.json());
    $('#board').innerHTML = rows.length ? rows.map((a) => noticeHtml(a)).join('') : '<div class="empty-state card">No announcements right now.</div>';
  } catch { $('#board').innerHTML = '<p class="text-muted">Could not load announcements.</p>'; }
}

function showGate(message) {
  token = null; me = null; sessionStorage.removeItem(TOKEN_KEY);
  $('#dash').classList.add('hidden'); $('#gate').classList.remove('hidden'); $('#termsBanner').innerHTML = '';
  if (message) { const e = $('#codeError'); e.textContent = message; e.classList.remove('hidden'); }
  loadGeneralBoard();
}

// ---------------------------------------------------------------- tabs
function overview() {
  const r = me.rent; const c = me.contract; const p = me.profile;
  const headline = r.monthsOwing > 0 ? `${r.monthsOwing} month${r.monthsOwing > 1 ? 's' : ''} owing` : r.monthsAdvance > 0 ? `${r.monthsAdvance} month${r.monthsAdvance > 1 ? 's' : ''} paid in advance` : 'Up to date';
  return `<div class="two-col"><div class="rent-hero"><div class="muted">Payment status</div><div class="big">${headline}</div><div style="margin:8px 0 16px">${statusBadge(r.status)}</div>
      <div class="three-col" style="gap:10px"><div><div class="muted">Monthly rent</div><b>${formatCurrency(r.monthlyRent)}</b></div><div><div class="muted">${r.amountOwing ? 'Amount owing' : 'Paid ahead'}</div><b>${formatCurrency(r.amountOwing || r.amountAdvance)}</b></div><div><div class="muted">Next payment</div><b>${formatDate(r.nextPaymentDate)}</b></div></div>
      <div class="three-col" style="gap:10px;margin-top:16px"><div><div class="muted">Months paid</div><b>${r.monthsPaid}</b></div><div><div class="muted">Months owing</div><b>${r.monthsOwing}</b></div><div><div class="muted">In advance</div><b>${r.monthsAdvance}</b></div></div>
      <div style="margin-top:18px"><button class="btn btn-accent btn-sm" data-go="pay">Pay rent</button></div></div>
    <div class="card card-pad"><h3 style="margin-top:0">My rental</h3><dl class="kv"><dt>Property</dt><dd>${escapeHtml(me.rental.propertyName)}</dd><dt>House</dt><dd>${escapeHtml(me.rental.houseNo)}</dd><dt>Unit</dt><dd>${escapeHtml(me.rental.unitNo)}</dd><dt>Category</dt><dd>${escapeHtml(me.rental.categoryName || '—')}</dd>
      <dt>Deposit</dt><dd>${formatCurrency(r.depositPaid)} of ${formatCurrency(r.securityDeposit)}</dd><dt>Moved in</dt><dd>${formatDate(p.moveInDate)} (${p.monthsStayed} month${p.monthsStayed === 1 ? '' : 's'})</dd></dl>
      ${c ? `<h3>My contract</h3><dl class="kv"><dt>Contract</dt><dd class="mono">${escapeHtml(c.contract_no)}</dd><dt>Start</dt><dd>${formatDate(c.start_date)}</dd><dt>Expiry</dt><dd>${formatDate(c.end_date)}</dd><dt>Notice period</dt><dd>${c.notice_period_days} days</dd></dl>` : ''}</div></div>
    <div class="section-title"><h2>Latest announcements</h2><button class="btn btn-ghost btn-sm" data-go="news">See all</button></div>${anns.slice(0, 3).map((a) => noticeHtml(a, true)).join('') || '<p class="text-muted">None right now.</p>'}
    ${me.notifications.length ? `<div class="section-title"><h2>Messages for you</h2></div>${me.notifications.slice(0, 5).map((n) => `<div class="notice-card"><strong>${escapeHtml(n.title)}</strong><div>${escapeHtml(n.message)}</div><div class="text-muted" style="font-size:.76rem">${formatDateTime(n.created_at)}</div></div>`).join('')}` : ''}`;
}

function payTab() {
  const t = me.payTo; const r = me.rent;
  const row = (label, num, name) => (num ? `<div class="card card-pad" style="margin-bottom:12px"><div class="muted text-muted" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em">${label}</div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="mono" style="font-size:1.3rem">${escapeHtml(num)}</span><button class="btn btn-sm btn-outline" data-copy="${escapeHtml(num)}">Copy number</button></div><div class="text-muted" style="font-size:.84rem">Name: ${escapeHtml(name || '—')}</div></div>` : '');
  const defAmt = r.amountOwing || r.monthlyRent;
  return `<div class="two-col" style="align-items:start"><div><h3 style="margin-top:0">1. Pay to</h3>${row('MTN Mobile Money', t.mtnNumber, t.mtnName)}${row('Orange Money', t.orangeNumber, t.orangeName)}${!t.mtnNumber && !t.orangeNumber ? '<p class="text-muted">Payment numbers have not been set up yet. Please contact management.</p>' : ''}
      <p class="text-muted" style="font-size:.88rem">${escapeHtml(t.instructions || 'Send the amount from your phone, then come back here and submit the transaction ID so we can confirm it.')}</p>${t.supportCall ? `<p>Need help? <a href="tel:${escapeHtml(t.supportCall)}">${escapeHtml(t.supportCall)}</a></p>` : ''}</div>
    <form id="payForm" class="card card-pad"><h3 style="margin-top:0">2. Tell us you paid</h3><p class="text-muted" style="margin-top:0;font-size:.86rem">Your balance updates after management confirms the payment. You will get a receipt then.</p>
      <div class="form-grid"><div class="field"><label>Payment for</label><select name="type"><option value="RENT">Rent</option><option value="DEPOSIT">Security deposit</option></select></div>
      <div class="field"><label>Method</label><select name="method"><option value="MTN_MOMO">MTN Mobile Money</option><option value="ORANGE_MONEY">Orange Money</option></select></div>
      <div class="field"><label>Amount (${escapeHtml(t.currency || 'FCFA')})</label><input name="amount" type="number" min="1" required value="${defAmt}"/></div>
      <div class="field"><label>Transaction ID</label><input name="transactionId" required minlength="4" placeholder="From your MoMo confirmation SMS"/></div>
      <div class="field"><label>Date &amp; time paid</label><input name="paidAt" type="datetime-local"/></div>
      <div class="field form-row-full"><label>Proof / note (optional)</label><textarea name="proofNote" rows="2" placeholder="Sender number, or a link to your screenshot"></textarea></div></div>
      <div id="payMsg" class="notice-card hidden"></div><button class="btn btn-primary btn-block" id="payBtn" type="submit">Submit payment for confirmation</button></form></div>`;
}

function paymentsTab() {
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt</th><th>Type</th><th>Amount</th><th>Months</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>${me.payments.map((p) => `<tr><td>${formatDate(p.paid_at || p.created_at)}</td><td class="mono">${escapeHtml(p.receipt_number || '—')}</td><td>${escapeHtml(p.type)}</td><td><strong>${formatCurrency(p.amount)}</strong></td><td>${p.months_covered ?? '—'}</td><td>${escapeHtml(METHOD_LABEL[p.method] || p.method)}</td><td>${p.status === 'SUCCESSFUL' ? '<span class="badge badge-success">Confirmed</span>' : p.status === 'PENDING' ? '<span class="badge badge-warning">Pending confirmation</span>' : '<span class="badge badge-danger">Not verified</span>'}</td><td>${p.status === 'SUCCESSFUL' ? `<button class="btn btn-sm btn-outline" data-receipt="${p.id}">View receipt</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty-state">No payments yet.</div></td></tr>'}</tbody></table></div>`;
}

function maintenanceTab() {
  return `<div class="two-col" style="align-items:start"><form id="mntForm" class="card card-pad"><h3 style="margin-top:0">Report a problem</h3><div class="field"><label>What is wrong?</label><input name="title" required maxlength="200" placeholder="e.g. Broken water pipe in the kitchen"/></div>
    <div class="field"><label>Details</label><textarea name="description" rows="3"></textarea></div><div class="field"><label>How urgent?</label><select name="priority"><option value="NORMAL">Normal</option><option value="HIGH">Urgent — needs attention soon</option><option value="LOW">Can wait</option></select></div><div id="mntMsg" class="notice-card hidden"></div><button class="btn btn-primary btn-block" type="submit" id="mntBtn">Send to management</button></form>
    <div><h3 style="margin-top:0">My requests</h3>${me.maintenance.map((m) => `<div class="notice-card"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${escapeHtml(m.title)}</strong>${statusBadge(m.status)}</div><div class="text-muted" style="font-size:.78rem"><span class="mono">${escapeHtml(m.request_no)}</span> · reported ${formatDate(m.reported_at)}${m.completed_at ? ` · done ${formatDate(m.completed_at)}` : ''}</div></div>`).join('') || '<p class="text-muted">No requests yet.</p>'}</div></div>`;
}

function newsTab() { return anns.map((a) => noticeHtml(a, true)).join('') || '<div class="empty-state card">No announcements for you right now.</div>'; }

function profileTab() {
  const p = me.profile;
  return `<div class="card card-pad" style="max-width:560px"><dl class="kv"><dt>Name</dt><dd>${escapeHtml(p.name)}</dd><dt>Tenant ID</dt><dd class="mono">${escapeHtml(p.tenantCode)}</dd><dt>Phone</dt><dd>${escapeHtml(p.phone)}</dd><dt>Email</dt><dd>${escapeHtml(p.email || '—')}</dd><dt>ID</dt><dd>${escapeHtml(p.idType || '—')} ${escapeHtml(p.idNumber || '')}</dd>
    <dt>Registered</dt><dd>${formatDate(p.registrationDate)}</dd><dt>Moved in</dt><dd>${formatDate(p.moveInDate)}</dd><dt>Months stayed</dt><dd>${p.monthsStayed}</dd><dt>Status</dt><dd>${statusBadge(p.status)}</dd>
    <dt>Terms &amp; conditions</dt><dd>${me.terms ? (me.terms.accepted ? `<span class="badge badge-success">Version ${me.terms.version} accepted</span>` : '<span class="badge badge-warning">Not accepted yet</span>') : '—'}</dd></dl>
    <p class="text-muted" style="font-size:.82rem">To change your phone number or ID details, please contact management.</p></div>`;
}

const TABS = [['overview', 'Overview', overview], ['pay', 'Pay rent', payTab], ['payments', 'Payments & receipts', paymentsTab], ['maintenance', 'Maintenance', maintenanceTab], ['news', 'Announcements', newsTab], ['profile', 'My profile', profileTab]];

function renderTerms() {
  const t = me.terms; const box = $('#termsBanner');
  if (!t || t.accepted) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card card-pad" style="border-left:4px solid var(--amber-500);margin-bottom:22px"><h3 style="margin-top:0">Please read and accept the terms &amp; conditions (version ${t.version})</h3><div style="white-space:pre-wrap;max-height:220px;overflow:auto;background:var(--slate-100);padding:14px;border-radius:10px;font-size:.88rem">${escapeHtml(t.body)}</div>
    <label style="display:flex;gap:8px;align-items:center;margin:14px 0 10px;font-weight:500"><input type="checkbox" id="agree" style="width:auto"/> I have read and I agree to these terms.</label><button class="btn btn-primary" id="agreeBtn" disabled>Accept terms</button></div>`;
  $('#agree').addEventListener('change', (e) => { $('#agreeBtn').disabled = !e.target.checked; });
  $('#agreeBtn').addEventListener('click', async () => { try { await post(`/portal/terms/${t.id}/accept`, {}); toast('Thank you — your acceptance has been recorded.', 'success'); await loadDashboard(); } catch (e) { toast(e.message, 'error'); } });
}

function render() {
  $('#gate').classList.add('hidden'); $('#dash').classList.remove('hidden');
  renderTerms();
  $('#dash').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px"><div><h2 style="margin:0">Hello, ${escapeHtml(me.profile.name.split(' ')[0])} 👋</h2><div class="text-muted">${escapeHtml(me.rental.propertyName)} · House ${escapeHtml(me.rental.houseNo)} · Unit ${escapeHtml(me.rental.unitNo)}</div></div><button class="btn btn-outline btn-sm" id="closeBtn">Close my account</button></div>
    <div class="chip-row" style="margin-top:16px" id="tabs">${TABS.map(([k, l]) => `<button class="chip ${k === tab ? 'is-active' : ''}" data-tab="${k}">${l}${k === 'payments' && me.pendingCount ? ` (${me.pendingCount} pending)` : ''}</button>`).join('')}</div><div id="panel"></div>`;
  $('#closeBtn').addEventListener('click', () => { showGate(); toast('Your account was closed on this device.'); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  const panel = $('#panel'); panel.innerHTML = TABS.find((x) => x[0] === tab)[2]();
  panel.addEventListener('click', onPanelClick);
  panel.querySelector('#payForm')?.addEventListener('submit', onPay); panel.querySelector('#mntForm')?.addEventListener('submit', onMaintenance);
}

async function onPanelClick(e) {
  const go = e.target.closest('[data-go]'); if (go) { tab = go.dataset.go; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Number copied.', 'success'); } catch { toast(`Number: ${cp.dataset.copy}`); } return; }
  const rc = e.target.closest('[data-receipt]');
  if (rc) { // fetch with the header, then open the PDF from a blob — the token never goes in a URL
    const w = window.open('', '_blank');
    try { const res = await fetch(`${API()}/portal/receipts/${rc.dataset.receipt}?format=pdf`, { headers: { 'x-portal-token': token } }); if (!res.ok) throw new Error(); const blob = await res.blob(); w.location = URL.createObjectURL(blob); } catch { w?.close(); toast('Could not open the receipt.', 'error'); }
  }
}

async function onPay(e) {
  e.preventDefault(); const btn = $('#payBtn'); const msg = $('#payMsg'); btn.disabled = true;
  const v = Object.fromEntries(new FormData(e.target).entries()); v.amount = Number(v.amount); if (!v.paidAt) delete v.paidAt; else v.paidAt = new Date(v.paidAt).toISOString();
  try { await post('/portal/payments', v); msg.className = 'notice-card'; msg.textContent = '✅ Received. Your payment is pending confirmation — management will check it and your balance and receipt will update.'; e.target.reset(); await loadDashboard(false); tab = 'payments'; render(); toast('Payment submitted for confirmation.', 'success'); }
  catch (err) { msg.className = 'notice-card k-URGENT'; msg.textContent = err.message; btn.disabled = false; }
}
async function onMaintenance(e) {
  e.preventDefault(); const btn = $('#mntBtn'); const msg = $('#mntMsg'); btn.disabled = true;
  try { await post('/portal/maintenance', Object.fromEntries(new FormData(e.target).entries())); await loadDashboard(false); tab = 'maintenance'; render(); toast('Sent to management.', 'success'); }
  catch (err) { msg.className = 'notice-card k-URGENT'; msg.textContent = err.message; btn.disabled = false; }
}

async function loadDashboard(draw = true) {
  try { [me, anns] = await Promise.all([call('/portal/me'), call('/portal/announcements')]); }
  catch (err) { showGate(err.status === 401 ? 'Your session expired. Please enter your tracking code again.' : err.message); return; }
  if (draw) render();
}

$('#codeForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = $('#codeBtn'); const err = $('#codeError'); err.classList.add('hidden'); btn.disabled = true; btn.textContent = 'Checking…';
  try { const r = await api.post('/portal/login', { code: $('#code').value, phoneLast4: $('#last4').value }, { silent: true }); token = r.token; sessionStorage.setItem(TOKEN_KEY, token); $('#code').value = ''; $('#last4').value = ''; tab = 'overview'; await loadDashboard(); }
  catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  btn.disabled = false; btn.textContent = 'Load my data';
});

if (token) loadDashboard(); else loadGeneralBoard();
