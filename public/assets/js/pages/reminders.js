import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, formatDate } from '../utils.js';

const groups = [['dueSoon', ' Rent due soon', 'DUE_SOON'], ['dueToday', ' Rent due today', 'DUE_TODAY'], ['overdue', ' Overdue', 'OVERDUE'], ['seriousArrears', ' Serious arrears (3+ months)', 'SERIOUS_ARREARS']];
function waLink(x, label) {
  const phone = String(x.phone || '').replace(/\D/g, '');
  const msg = x.amount_owing > 0 ? `Hello ${x.name}, this is a reminder that ${formatCurrency(x.amount_owing)} rent is outstanding for ${x.property_name}, House ${x.house_no} Unit ${x.unit_no}. Please pay as soon as possible. Thank you.` : `Hello ${x.name}, your rent of ${formatCurrency(x.monthly_rent)} for ${x.property_name}, House ${x.house_no} Unit ${x.unit_no} is due on ${formatDate(x.next_payment_date)}. Thank you.`;
  return `<a class="btn btn-sm btn-outline" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}">${label}</a>`;
}
async function main() {
  await initPortalLayout({ activeKey: 'reminders', perms: ['payments', 'finance', 'tenants'], title: 'Rent Reminders', subtitle: 'Who needs a nudge. One tap opens a ready-written WhatsApp message.' });
  const r = await api.get('/analytics/reminders');
  qs('#pageRoot').innerHTML = groups.map(([k, title]) => `<div class="section-title" style="margin-top:${k === 'dueSoon' ? 0 : 28}px"><h2>${title} (${r[k].length})</h2></div><div id="m_${k}"></div>`).join('');
  groups.forEach(([k]) => renderTable(qs(`#m_${k}`), r[k], [
    { label: 'Tenant', render: (x) => `<a href="/admin/tenant-profile.html?id=${x.tenant_id}"><strong>${escapeHtml(x.name)}</strong></a><div class="text-muted" style="font-size:.78rem">${escapeHtml(x.phone)}</div>` },
    { label: 'Unit', render: (x) => `${escapeHtml(x.property_name)} · ${escapeHtml(x.house_no)}/${escapeHtml(x.unit_no)}` }, { label: 'Due', render: (x) => formatDate(x.next_payment_date) },
    { label: 'Owing', render: (x) => (x.amount_owing ? formatCurrency(x.amount_owing) : '—') }, { label: '', render: (x) => waLink(x, 'WhatsApp reminder') },
  ], { pageSize: 8, emptyMessage: 'Nobody in this group.' }));
}
main();
