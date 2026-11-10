import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatCurrency, formatDateTime, escapeHtml, toast, qs } from './utils.js';

const KIND = (k) => (k.startsWith('UPCOMING') ? `Due in ${k.split(':')[1]} day(s)` : k === 'DUE' ? 'Due today' : k === 'OVERDUE' ? 'Overdue' : 'Outstanding balance');
let tab = 'due';

function tabs() {
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">${[['due', 'Due now'], ['schedules', 'Instalment schedules'], ['settings', 'Settings'], ['log', 'Message log']]
    .map(([k, l]) => `<button class="btn btn-sm ${tab === k ? 'btn-primary' : 'btn-outline'}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tabBody"><div class="spinner"></div></div>`;
}

async function viewDue() {
  const p = await api.get('/reminders/preview');
  const status = !p.enabled ? 'Automatic reminders are OFF.' : !p.providerReady ? 'Reminders are ON but no SMS/WhatsApp provider is configured on the server, so nothing can be sent automatically.' : 'Automatic reminders are ON and the provider is configured.';
  qs('#tabBody').innerHTML = `<div class="card card-pad" style="margin-bottom:12px;"><p style="margin:0 0 8px;"><strong>${escapeHtml(status)}</strong> Today (school time): ${escapeHtml(p.today)}. ${p.items.length} reminder${p.items.length === 1 ? '' : 's'} due.</p>
    <button class="btn btn-primary" id="runNow" ${p.items.length && p.enabled && p.providerReady ? '' : 'disabled'}>Send all now</button>
    <span class="text-muted" style="font-size:.8rem;margin-left:8px;">A family is never sent the same reminder twice in a day. Without a provider, use the WhatsApp button on each row and tick "Sent".</span></div><div id="dueTable"></div>`;
  renderTable(qs('#dueTable'), p.items, [
    { key: 'student', label: 'Student', render: (r) => `${escapeHtml(r.student)}<br><span class="text-muted" style="font-size:.76rem;">${escapeHtml(r.className)} · ${escapeHtml(r.guardian)}</span>` },
    { key: 'kind', label: 'Reminder', render: (r) => `${KIND(r.kind)}${r.installmentName ? `<br><span class="text-muted" style="font-size:.76rem;">${escapeHtml(r.installmentName)} · due ${escapeHtml(r.dueDate)}</span>` : ''}` },
    { key: 'amountDue', label: 'Amount', render: (r) => `${formatCurrency(r.amountDue)}<br><span class="text-muted" style="font-size:.76rem;">Balance ${formatCurrency(r.balance)}</span>` },
    { key: 'body', label: 'Message', render: (r) => `<span style="font-size:.8rem;">${escapeHtml(r.body)}</span>` },
    { key: 'a', label: '', render: (r) => `<div style="display:flex;flex-direction:column;gap:6px;"><a class="btn btn-sm btn-outline" target="_blank" rel="noopener" href="tel:${escapeHtml(r.phone)}">Call</a>
      ${r.waLink ? `<a class="btn btn-sm btn-outline" target="_blank" rel="noopener" href="${escapeHtml(r.waLink)}">WhatsApp</a>` : ''}
      <button class="btn btn-sm btn-ghost" data-sent='${escapeHtml(JSON.stringify({ invoiceId: r.invoiceId, installmentId: r.installmentId, kind: r.kind, to: r.whatsapp, text: r.body, studentId: r.studentId }))}'>Mark as sent</button></div>` },
  ], { emptyMessage: 'No reminders are due today.', pageSize: 20 });
  qs('#runNow')?.addEventListener('click', async () => {
    if (!window.confirm(`Send ${p.items.length} reminder(s) now?`)) return;
    const r = await api.post('/reminders/run', {});
    toast(r.ran ? `Sent ${r.sent}, failed ${r.failed}.` : r.reason, r.ran ? 'success' : 'error'); await viewDue();
  });
  qs('#dueTable').onclick = async (e) => { const b = e.target.closest('[data-sent]'); if (!b) return; await api.post('/reminders/manual', JSON.parse(b.dataset.sent)); toast('Recorded as sent.', 'success'); await viewDue(); };
}

async function viewSettings() {
  const s = await api.get('/reminders/settings');
  const cfg = s.configured; const ok = (p, c) => (cfg[p]?.[c] ? 'configured' : 'not configured');
  qs('#tabBody').innerHTML = `<form id="setForm" class="card card-pad"><div class="form-grid">
    <div class="field"><label>Messaging provider</label><select name="provider">${['NONE', 'TWILIO', 'WHATSAPP_CLOUD', 'HTTP_GATEWAY'].map((v) => `<option ${s.provider === v ? 'selected' : ''} value="${v}">${v === 'NONE' ? 'None (off)' : v.replace('_', ' ')}</option>`).join('')}</select></div>
    <div class="field"><label>Send by</label><select name="channel">${['SMS', 'WHATSAPP', 'BOTH'].map((v) => `<option ${s.channel === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>Remind this many days BEFORE a due date (comma separated)</label><input name="daysBefore" value="${escapeHtml((s.days_before || []).join(', '))}" /></div>
    <div class="field"><label>Repeat when overdue every N days (0 = never)</label><input name="overdueEveryDays" type="number" min="0" value="${s.overdue_every_days}" /></div>
    <div class="field"><label>Stop after N overdue reminders</label><input name="maxOverdueReminders" type="number" min="0" value="${s.max_overdue_reminders}" /></div>
    <div class="field"><label>Balance nudge every N days for invoices with no schedule (0 = off)</label><input name="outstandingEveryDays" type="number" min="0" value="${s.outstanding_every_days}" /></div>
    <label class="form-row-full"><input type="checkbox" name="remindOnDue" ${s.remind_on_due ? 'checked' : ''} /> Also remind on the due date</label>
    <label class="form-row-full"><input type="checkbox" name="remindersEnabled" ${s.reminders_enabled ? 'checked' : ''} /> <strong>Automatic reminders ON</strong></label>
    <label class="form-row-full"><input type="checkbox" name="requireOtpForLookup" ${s.require_otp_for_lookup ? 'checked' : ''} /> Require a code sent to the guardian's phone before showing a student's record on the public page</label>
    ${[['templateUpcoming', 'template_upcoming', 'Before due date'], ['templateDue', 'template_due', 'On due date'], ['templateOverdue', 'template_overdue', 'Overdue'], ['templateBalance', 'template_balance', 'Balance nudge']]
      .map(([n, c, l]) => `<div class="field form-row-full"><label>Message — ${l}</label><textarea name="${n}" rows="2">${escapeHtml(s[c])}</textarea></div>`).join('')}
    <p class="text-muted form-row-full" style="font-size:.8rem;">Placeholders: {student} {guardian} {amount} {due_date} {balance} {invoice} {school} {phone}</p></div>
    <button class="btn btn-primary" type="submit">Save settings</button></form>
    <div class="card card-pad" style="margin-top:14px;"><h3 style="margin-top:0;">Provider credentials</h3>
      <p class="text-muted" style="font-size:.84rem;">Passwords and API keys are never typed into this website. Your developer sets them as environment variables on the server (Render → Environment). Status on the server right now:</p>
      <ul style="font-size:.86rem;">${Object.entries(s.envNeeded).map(([p, vars]) => `<li><strong>${p.replace('_', ' ')}</strong> — SMS: ${ok(p, 'SMS')}, WhatsApp: ${ok(p, 'WHATSAPP')}<br><span class="text-muted">needs: ${vars.map(escapeHtml).join(', ')}</span></li>`).join('')}</ul></div>`;
  qs('#setForm').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { provider: f.provider.value, channel: f.channel.value, daysBefore: f.daysBefore.value, overdueEveryDays: Number(f.overdueEveryDays.value), maxOverdueReminders: Number(f.maxOverdueReminders.value), outstandingEveryDays: Number(f.outstandingEveryDays.value),
      remindOnDue: f.remindOnDue.checked, remindersEnabled: f.remindersEnabled.checked, requireOtpForLookup: f.requireOtpForLookup.checked,
      templateUpcoming: f.templateUpcoming.value, templateDue: f.templateDue.value, templateOverdue: f.templateOverdue.value, templateBalance: f.templateBalance.value };
    await put('/reminders/settings', body); toast('Settings saved.', 'success'); await viewSettings();
  };
}

async function put(path, body) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}${path}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'Could not save.', 'error'); throw new Error(data.error || 'failed'); }
  return data;
}

async function viewSchedules() {
  const fees = await api.get('/academics/fee-structures');
  qs('#tabBody').innerHTML = `<div class="card card-pad"><p class="text-muted" style="font-size:.84rem;margin-top:0;">Split a class's total fee into instalments with due dates. New invoices get a frozen copy of the schedule, so changing it later never alters what a family already agreed. To bring existing students onto a new schedule use "Apply to students who have no schedule".</p>
    <div class="field"><label>Fee structure</label><select id="feeSel"><option value="">Select…</option>${fees.map((f) => `<option value="${f.id}">${escapeHtml(f.class_name)} — ${escapeHtml(f.session_name)} (${formatCurrency(f.total)})</option>`).join('')}</select></div><div id="schedBody"></div></div>`;
  qs('#feeSel').onchange = async (e) => {
    if (!e.target.value) { qs('#schedBody').innerHTML = ''; return; }
    const { total, items } = await api.get(`/reminders/installments/${e.target.value}`);
    const row = (it = {}) => `<tr><td><input data-f="name" value="${escapeHtml(it.name || '')}" placeholder="e.g. First instalment" /></td><td><input data-f="amount" type="number" min="1" value="${it.amount || ''}" /></td><td><input data-f="dueDate" type="date" value="${it.due_date || ''}" /></td><td><button type="button" class="btn btn-sm btn-ghost" data-del>&times;</button></td></tr>`;
    qs('#schedBody').innerHTML = `<p>Total fee: <strong>${formatCurrency(total)}</strong> · instalments entered: <strong id="sumNow">0</strong></p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Amount (FCFA)</th><th>Due date</th><th></th></tr></thead><tbody id="rows">${(items.length ? items : [{}]).map(row).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="btn btn-outline" id="addRow" type="button">+ Add instalment</button><button class="btn btn-primary" id="saveSched" type="button">Save schedule</button><button class="btn btn-outline" id="applyAll" type="button">Apply to students who have no schedule</button></div>`;
    const sum = () => { qs('#sumNow').textContent = formatCurrency([...qs('#rows').querySelectorAll('[data-f=amount]')].reduce((s, i) => s + Number(i.value || 0), 0)); };
    sum(); qs('#rows').oninput = sum;
    qs('#addRow').onclick = () => { qs('#rows').insertAdjacentHTML('beforeend', row()); };
    qs('#rows').onclick = (ev) => { if (ev.target.closest('[data-del]')) { ev.target.closest('tr').remove(); sum(); } };
    qs('#saveSched').onclick = async () => {
      const list = [...qs('#rows').querySelectorAll('tr')].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.dataset.f === 'amount' ? Number(i.value) : i.value]))).filter((r) => r.name || r.amount || r.dueDate);
      await put(`/reminders/installments/${e.target.value}`, { items: list }); toast('Schedule saved.', 'success');
    };
    qs('#applyAll').onclick = async () => { if (!window.confirm('Copy this schedule onto existing invoices of this fee that have none? Invoices that already have a schedule are not touched.')) return; const r = await api.post(`/reminders/installments/${e.target.value}/apply`, {}); toast(`${r.rowsCreated} instalment rows added.`, 'success'); };
  };
}

async function viewLog() {
  const rows = await api.get('/reminders/outbox');
  qs('#tabBody').innerHTML = '<div id="logTable"></div>';
  renderTable(qs('#logTable'), rows, [
    { key: 'created_at', label: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'student', label: 'Student', render: (r) => (r.first_name ? `${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}` : '—') },
    { key: 'to_phone', label: 'To', render: (r) => `${escapeHtml(r.to_phone)}<br><span class="text-muted" style="font-size:.74rem;">${escapeHtml(r.channel)}</span>` },
    { key: 'status', label: 'Result', render: (r) => `<strong style="color:${r.status === 'SENT' || r.status === 'MANUAL' ? '#1a7f37' : '#c62828'}">${r.status === 'MANUAL' ? 'Sent by hand' : escapeHtml(r.status.replace('_', ' '))}</strong>${r.error ? `<br><span class="text-muted" style="font-size:.74rem;">${escapeHtml(r.error)}</span>` : ''}` },
    { key: 'body', label: 'Message', render: (r) => `<span style="font-size:.8rem;">${escapeHtml(r.body)}</span>` },
  ], { emptyMessage: 'Nothing has been sent yet.', pageSize: 20 });
}

const VIEWS = { due: viewDue, schedules: viewSchedules, settings: viewSettings, log: viewLog };
async function show() { qs('#pageRoot').innerHTML = tabs(); await VIEWS[tab]().catch(() => { qs('#tabBody').innerHTML = '<p class="text-muted">Could not load this section.</p>'; }); }

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'fee-reminders' });
  await show();
  qs('#pageRoot').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; show(); } });
}
main();
