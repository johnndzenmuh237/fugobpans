import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable, openFormModal, openModal, confirmDialog } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate, statusBadge, METHOD_LABEL, toast } from '../utils.js';
import { param } from './_common.js';

const id = param('id');
let profile; let data;
const today = () => new Date().toISOString().slice(0, 10);

async function load() {
  data = await api.get(`/tenants/${id}`);
  const t = data.tenant; const r = t.rent; const active = ['ACTIVE', 'NOTICE'].includes(t.status);
  document.querySelector('.page-head h1').textContent = `${t.first_name} ${t.last_name}`;
  document.querySelector('.page-head p').textContent = `${t.tenant_code} · ${t.property_name} · House ${t.house_no} · Unit ${t.unit_no}`;
  const can = (p) => profile.permissions.includes(p);
  qs('#pageActions').innerHTML = `<a class="btn btn-ghost btn-sm" href="/admin/tenants.html">&larr; Tenants</a> ${active && can('payments') ? '<button class="btn btn-primary btn-sm" id="payBtn">Record payment</button>' : ''} ${can('tenants') ? '<button class="btn btn-outline btn-sm" id="editBtn">Edit</button>' : ''} ${active && can('tenants') ? '<button class="btn btn-outline btn-sm" id="outBtn">Move out</button>' : ''}`;

  qs('#pageRoot').innerHTML = `
    <div class="two-col">
      <div class="rent-hero"><div class="muted">Rent position</div>
        <div class="big">${r.monthsOwing > 0 ? `${r.monthsOwing} month${r.monthsOwing > 1 ? 's' : ''} owing` : r.monthsAdvance > 0 ? `${r.monthsAdvance} month${r.monthsAdvance > 1 ? 's' : ''} in advance` : `${r.monthsPaid} months paid`}</div>
        <div style="margin:8px 0 14px">${statusBadge(active ? r.status : t.status)}</div>
        <div class="three-col" style="gap:10px"><div><div class="muted">Monthly rent</div><b>${formatCurrency(t.monthly_rent)}</b></div><div><div class="muted">${r.amountOwing ? 'Amount owing' : 'Paid ahead'}</div><b>${formatCurrency(r.amountOwing || r.amountAdvance)}</b></div><div><div class="muted">Next payment</div><b>${active ? formatDate(r.nextPaymentDate) : '—'}</b></div></div>
        <div style="margin-top:14px;font-size:.84rem;color:rgba(255,255,255,.75)">Total rent paid ${formatCurrency(t.rent_paid)} · ${r.monthsPaid} full month(s) covered · Deposit paid ${formatCurrency(t.deposit_paid)} of ${formatCurrency(t.security_deposit)}</div></div>
      <div class="card card-pad"><dl class="kv"><dt>Phone</dt><dd>${escapeHtml(t.phone)}</dd><dt>WhatsApp</dt><dd>${escapeHtml(t.whatsapp || '—')}</dd><dt>Email</dt><dd>${escapeHtml(t.email || '—')}</dd>
        <dt>ID</dt><dd>${escapeHtml([t.id_type, t.id_number].filter(Boolean).join(' · ') || '—')}</dd><dt>Occupation</dt><dd>${escapeHtml(t.occupation || '—')}</dd>
        <dt>Emergency</dt><dd>${escapeHtml([t.emergency_contact_name, t.emergency_contact_phone].filter(Boolean).join(' · ') || '—')}</dd><dt>Moved in</dt><dd>${formatDate(t.move_in_date)}</dd>
        <dt>Category</dt><dd>${escapeHtml(t.category_name || '—')}</dd><dt>Terms accepted</dt><dd>${data.termsAccepted ? `v${data.termsAccepted.version} on ${formatDate(data.termsAccepted.accepted_at)}${data.currentTermsVersion && data.termsAccepted.version < data.currentTermsVersion ? ' (newer version pending)' : ''}` : (data.currentTermsVersion ? '<span style="color:var(--danger-600)">Not yet</span>' : '—')}</dd>
        <dt>Tracking code</dt><dd><span class="mono">${escapeHtml(t.tracking_code)}</span> ${can('tenants') ? '<button class="btn btn-sm btn-ghost" id="regenBtn">New code</button>' : ''}</dd></dl>
        ${t.pending_payments ? `<p style="margin:12px 0 0"><a href="/admin/pending-payments.html"> ${t.pending_payments} payment(s) awaiting confirmation</a></p>` : ''}</div>
    </div>
    <div class="section-title"><h2>Payment history</h2></div><div id="payMount"></div>
    <div class="section-title"><h2>Contracts</h2></div><div id="conMount"></div>
    <div class="section-title"><h2>Maintenance requests</h2></div><div id="mntMount"></div>`;

  renderTable(qs('#payMount'), data.payments, [
    { label: 'Date', render: (p) => formatDate(p.paid_at || p.created_at) }, { label: 'Receipt', render: (p) => (p.receipt_number ? `<a class="mono" href="/admin/receipt.html?id=${p.id}">${escapeHtml(p.receipt_number)}</a>` : '—') },
    { label: 'Type', render: (p) => escapeHtml(p.type) }, { label: 'Amount', render: (p) => formatCurrency(p.amount) }, { label: 'Months', render: (p) => p.months_covered ?? '—' },
    { label: 'Period', render: (p) => (p.period_from ? `${formatDate(p.period_from)} → ${formatDate(p.period_to)}` : '—') }, { label: 'Method', render: (p) => escapeHtml(METHOD_LABEL[p.method] || p.method) }, { label: 'Status', render: (p) => statusBadge(p.status) },
  ], { pageSize: 8, emptyMessage: 'No payments yet.' });
  renderTable(qs('#conMount'), data.contracts, [
    { label: 'Contract', render: (c) => `<span class="mono">${escapeHtml(c.contract_no)}</span>` }, { label: 'Period', render: (c) => `${formatDate(c.start_date)} → ${formatDate(c.end_date)}` },
    { label: 'Rent', render: (c) => formatCurrency(c.monthly_rent) }, { label: 'Notice', render: (c) => `${c.notice_period_days} days` }, { label: 'Status', render: (c) => statusBadge(c.status) },
    { label: '', render: (c) => (c.status === 'ACTIVE' && can('contracts') && active ? `<button class="btn btn-sm btn-outline" data-renew="${c.id}">Renew</button>` : '') },
  ], { pageSize: 5, emptyMessage: 'No contracts.' });
  renderTable(qs('#mntMount'), data.maintenance, [
    { label: 'Request', render: (m) => `<span class="mono">${escapeHtml(m.request_no)}</span>` }, { label: 'Problem', render: (m) => escapeHtml(m.title) }, { label: 'Reported', render: (m) => formatDate(m.reported_at) }, { label: 'Status', render: (m) => statusBadge(m.status) },
  ], { pageSize: 5, emptyMessage: 'No maintenance requests.' });

  qs('#payBtn')?.addEventListener('click', () => openFormModal({ title: 'Record a payment', intro: `Credits the tenant immediately and issues a receipt. Monthly rent is ${formatCurrency(t.monthly_rent)}.`,
    fields: [{ name: 'type', label: 'Payment for', type: 'select', noBlank: true, options: [{ value: 'RENT', label: 'Rent' }, { value: 'DEPOSIT', label: 'Security deposit' }, { value: 'OTHER', label: 'Other income' }] },
      { name: 'amount', label: 'Amount (FCFA)', type: 'number', min: 1, required: true, default: t.rent.amountOwing || t.monthly_rent },
      { name: 'method', label: 'Method', type: 'select', noBlank: true, options: Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label })) },
      { name: 'transactionReference', label: 'Transaction ID', help: 'Leave blank for cash.' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
    onSubmit: async (v) => { const p = await api.post('/payments', { ...v, tenantId: id, amount: Number(v.amount) }); toast(`Receipt ${p.receipt_number} issued.`, 'success'); await load(); } }));
  qs('#editBtn')?.addEventListener('click', () => openFormModal({ title: 'Edit tenant', initial: { ...t, firstName: t.first_name, lastName: t.last_name, idType: t.id_type, idNumber: t.id_number, emergencyContactName: t.emergency_contact_name, emergencyContactPhone: t.emergency_contact_phone },
    fields: [{ name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name', required: true }, { name: 'phone', label: 'Phone', required: true }, { name: 'whatsapp', label: 'WhatsApp' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'occupation', label: 'Occupation' }, { name: 'idType', label: 'ID type' }, { name: 'idNumber', label: 'ID number' }, { name: 'emergencyContactName', label: 'Emergency contact' }, { name: 'emergencyContactPhone', label: 'Emergency phone' }, { name: 'address', label: 'Address', full: true },
      ...(active ? [{ name: 'status', label: 'Tenancy', type: 'select', noBlank: true, options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'NOTICE', label: 'Gave notice to leave' }] }] : []), { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
    onSubmit: async (v) => { await api.patch(`/tenants/${id}`, v); await load(); } }));
  qs('#outBtn')?.addEventListener('click', () => openFormModal({ title: `Move out ${t.first_name} ${t.last_name}`, intro: `The unit becomes vacant and the contract ends. History is kept.${r.amountOwing ? ` <strong style="color:var(--danger-600)">They still owe ${formatCurrency(r.amountOwing)}.</strong> Consider recording it under Debt Tracking.` : ''}`,
    fields: [{ name: 'outcome', label: 'Outcome', type: 'select', noBlank: true, options: [{ value: 'MOVED_OUT', label: 'Moved out' }, { value: 'EVICTED', label: 'Evicted' }] }, { name: 'date', label: 'Date', type: 'date', default: today() }, { name: 'note', label: 'Note', type: 'textarea', full: true }],
    submitLabel: 'Confirm move-out', onSubmit: async (v) => { await api.post(`/tenants/${id}/move-out`, v); await load(); } }));
  qs('#regenBtn')?.addEventListener('click', async () => { if (!(await confirmDialog('Generate a new tracking code? The old code will stop working immediately.', { confirmLabel: 'Generate' }))) return; const c = await api.post(`/tenants/${id}/tracking-code`, {}); openModal({ title: 'New tracking code', html: `<p>Give this to the tenant:</p><p class="mono" style="font-size:1.6rem;letter-spacing:.12em">${escapeHtml(c.trackingCode)}</p>` }); await load(); });
  qs('#conMount').onclick = (e) => { const b = e.target.closest('[data-renew]'); if (!b) return; openFormModal({ title: 'Renew contract', intro: 'The new contract starts the day after the current one ends. Rent stays the same.', fields: [{ name: 'months', label: 'Renewal length (months)', type: 'number', min: 1, max: 120, default: 12, required: true }, { name: 'noticePeriodDays', label: 'Notice period (days)', type: 'number', default: 30 }], submitLabel: 'Renew', onSubmit: async (v) => { await api.post(`/contracts/${b.dataset.renew}/renew`, { months: Number(v.months), noticePeriodDays: Number(v.noticePeriodDays) || undefined }); await load(); } }); };
}
async function main() { profile = await initPortalLayout({ activeKey: 'tenants', title: 'Tenant', subtitle: '' }); await load(); }
main();
