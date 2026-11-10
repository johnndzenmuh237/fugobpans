import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDateTime, escapeHtml, toast, qs } from './utils.js';

const LABEL = { MATCHED: 'Matched', AMOUNT_MISMATCH: 'Amount differs', UNRECORDED: 'Money received, not recorded', PENDING_VERIFICATION: 'Proven — awaiting verification', REJECTED_BUT_RECEIVED: 'Rejected but money received', NOT_IN_STATEMENT: 'Recorded, not in statement' };
const COLOR = { MATCHED: '#1a7f37', AMOUNT_MISMATCH: '#c62828', UNRECORDED: '#c62828', PENDING_VERIFICATION: '#b45309', REJECTED_BUT_RECEIVED: '#c62828', NOT_IN_STATEMENT: '#c62828' };
const API = () => window.APP_CONFIG.API_BASE_URL;
let report = null;

const params = () => { const p = new URLSearchParams({ provider: qs('#provider').value }); if (qs('#from').value) p.set('from', qs('#from').value); if (qs('#to').value) p.set('to', qs('#to').value); return p; };

function resolveDialog(payload) {
  openFormModal({ title: 'Resolve this difference', submitLabel: 'Save decision',
    fields: [{ name: 'outcome', label: 'Outcome', type: 'select', required: true, options: [
      { value: 'INVESTIGATED', label: 'Investigated — explained' }, { value: 'ACCEPTED_DIFFERENCE', label: 'Accept the difference' },
      { value: 'WRITTEN_OFF', label: 'Written off' }, ...(payload.paymentId && payload.lineId ? [{ value: 'MATCHED_MANUALLY', label: 'Match by hand (same payment)' }] : []) ] },
      { name: 'note', label: 'Explain the decision (kept permanently)', type: 'textarea', full: true, required: true }],
    onSubmit: async (v) => { await api.post('/reconciliation/resolve', { ...payload, ...v }); toast('Decision recorded.', 'success'); await run(); } });
}

async function run() {
  qs('#result').innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';
  report = await api.get(`/reconciliation/report?${params()}`);
  if (!report.summary) { qs('#result').innerHTML = `<div class="card card-pad text-muted">${escapeHtml(report.note || 'Nothing to show.')}</div>`; return; }
  const s = report.summary;
  const tile = (label, val, bad) => `<div class="card card-pad" style="min-width:150px;flex:1;"><div class="text-muted" style="font-size:.78rem;">${label}</div><div style="font-size:1.35rem;font-weight:700;color:${bad && val ? '#c62828' : 'inherit'}">${val}</div></div>`;
  qs('#result').innerHTML = `
    <p class="text-muted" style="font-size:.84rem;">Statement covers ${formatDateTime(report.coverage?.from)} → ${formatDateTime(report.coverage?.to)}. Recorded payments are only compared inside that window.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      ${tile('Statement credits', `${s.statementLines} · ${formatCurrency(s.statementTotal)}`)}${tile('Matched', `${s.matched} · ${formatCurrency(s.matchedTotal)}`)}
      ${tile('Amount differs', s.amountMismatch, true)}${tile('Received, not recorded', `${s.unrecorded} · ${formatCurrency(s.unrecordedTotal)}`, s.unrecorded)}
      ${tile('Recorded, not in statement', `${s.notInStatement} · ${formatCurrency(s.notInStatementTotal)}`, s.notInStatement)}${tile('Awaiting verification (proven)', s.pendingVerification)}
    </div>
    <p style="font-weight:700;color:${s.clean ? '#1a7f37' : '#c62828'};">${s.clean ? 'Books and statement agree for this period.' : 'There are differences to investigate below.'}</p>
    <h3>Statement lines</h3><div id="linesTable"></div><h3 style="margin-top:20px;">Recorded as received but missing from the statement</h3><div id="missingTable"></div>`;
  const resCell = (r) => (r.resolution ? `<span style="font-size:.78rem;color:#555;">${escapeHtml(r.resolution.outcome)} — ${escapeHtml(r.resolution.note)}<br>${escapeHtml(r.resolution.resolved_by_name)}, ${formatDateTime(r.resolution.resolved_at)}</span>` : '');
  renderTable(qs('#linesTable'), [...report.lines].sort((a, b) => (a.status === 'MATCHED') - (b.status === 'MATCHED')), [
    { key: 'status', label: 'Finding', render: (r) => `<strong style="color:${COLOR[r.status]}">${LABEL[r.status]}</strong>` },
    { key: 'txId', label: 'Transaction ID', render: (r) => `<span class="mono">${escapeHtml(r.txId)}</span><br><span class="text-muted" style="font-size:.74rem;">${r.txTime ? formatDateTime(r.txTime) : ''}</span>` },
    { key: 'amount', label: 'Statement', render: (r) => formatCurrency(r.amount) },
    { key: 'payment', label: 'Recorded', render: (r) => (r.payment ? `${formatCurrency(r.payment.amount)} (${r.payment.status})<br><span style="font-size:.76rem;">${escapeHtml(r.payment.student)} · ${escapeHtml(r.payment.receipt || '')}<br>Verified by ${escapeHtml(r.payment.verifiedBy || '—')}</span>` : '—') },
    { key: 'res', label: 'Decision', render: (r) => resCell(r) || (r.status === 'MATCHED' || r.status === 'PENDING_VERIFICATION' ? '' : `<button class="btn btn-sm btn-outline" data-rl='${JSON.stringify({ lineId: r.lineId, paymentId: r.payment?.id })}'>Resolve</button>`) },
  ], { emptyMessage: 'No lines.', pageSize: 20 });
  renderTable(qs('#missingTable'), report.missing, [
    { key: 'txId', label: 'Transaction ID', render: (r) => `<span class="mono">${escapeHtml(r.txId)}</span>${r.noRealId ? '<br><span style="color:#b45309;font-size:.74rem;">Recorded without a real transaction ID</span>' : ''}` },
    { key: 'amount', label: 'Recorded', render: (r) => formatCurrency(r.amount) },
    { key: 'student', label: 'Student', render: (r) => `${escapeHtml(r.student)} · ${escapeHtml(r.receipt || '')}` },
    { key: 'verifiedBy', label: 'Verified by', render: (r) => escapeHtml(r.verifiedBy || '—') },
    { key: 'res', label: 'Decision', render: (r) => resCell(r) || `<button class="btn btn-sm btn-outline" data-rp='${JSON.stringify({ paymentId: r.paymentId })}'>Resolve</button>` },
  ], { emptyMessage: 'Every recorded payment in the window appears in the statement.' });
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'reconciliation' });
  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="margin-bottom:14px;">
      <h3 style="margin-top:0;">1. Import a statement</h3>
      <p class="text-muted" style="font-size:.84rem;">Download the transaction statement (CSV) from your MTN MoMo or Orange Money merchant portal and upload it here. Each file is stored once; transactions already imported are skipped. The file needs a transaction-ID column and an amount column.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
        <div class="field"><label>Network</label><select id="impProvider"><option value="MTN_MOMO">MTN Mobile Money</option><option value="ORANGE_MONEY">Orange Money</option></select></div>
        <div class="field"><label>Statement file (.csv)</label><input id="impFile" type="file" accept=".csv,text/csv" /></div>
        <button class="btn btn-primary" id="impBtn">Import</button>
      </div><div id="impMsg" class="text-muted" style="margin-top:8px;"></div></div>
    <div class="card card-pad" style="margin-bottom:14px;"><h3 style="margin-top:0;">2. Compare</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
        <div class="field"><label>Network</label><select id="provider"><option value="MTN_MOMO">MTN Mobile Money</option><option value="ORANGE_MONEY">Orange Money</option></select></div>
        <div class="field"><label>From</label><input id="from" type="date" /></div><div class="field"><label>To</label><input id="to" type="date" /></div>
        <button class="btn btn-primary" id="runBtn">Compare</button><button class="btn btn-outline" id="csvBtn">Download differences (CSV)</button></div></div>
    <div id="result"></div>`;
  qs('#impBtn').onclick = async () => {
    const f = qs('#impFile').files[0]; if (!f) return toast('Choose the statement file first.', 'error');
    if (f.size > 6 * 1024 * 1024) return toast('File is larger than 6 MB — export a shorter date range.', 'error');
    try { const r = await api.post('/reconciliation/import', { provider: qs('#impProvider').value, filename: f.name, content: await f.text() });
      qs('#impMsg').textContent = `Imported: ${r.rowsAdded} new transaction(s); ${r.rowsSkipped} skipped (debits, failed, or already imported).`; qs('#provider').value = qs('#impProvider').value; toast('Statement imported.', 'success'); } catch { /* api.js already showed the error */ }
  };
  qs('#runBtn').onclick = () => run().catch(() => { qs('#result').innerHTML = ''; });
  qs('#csvBtn').onclick = () => { window.location.href = `${API()}/reconciliation/report?${params()}&format=csv`; };
  qs('#result').onclick = (e) => { const a = e.target.closest('[data-rl],[data-rp]'); if (a) resolveDialog(JSON.parse(a.dataset.rl || a.dataset.rp)); };
}
main();
