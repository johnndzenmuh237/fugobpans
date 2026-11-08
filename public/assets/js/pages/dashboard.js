import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { qs, formatCurrency, formatDate, escapeHtml, statusBadge } from '../utils.js';
import { renderTable } from '../crud-table.js';
import { card } from './_common.js';

function bars(trend) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.revenue, t.expenses]));
  return `<div class="legend"><span><i style="background:var(--indigo-600)"></i>Rent collected</span><span><i style="background:var(--amber-500)"></i>Expenses</span></div>
    <div class="bar-chart">${trend.map((t) => `<div class="col"><div class="pair"><i class="rev" style="height:${(t.revenue / max) * 100}%" title="Rent: ${formatCurrency(t.revenue)}"></i><i class="exp" style="height:${(t.expenses / max) * 100}%" title="Expenses: ${formatCurrency(t.expenses)}"></i></div></div>`).join('')}</div>
    <div class="bar-labels">${trend.map((t) => `<span>${t.month.slice(2)}</span>`).join('')}</div>`;
}

async function main() {
  const profile = await initPortalLayout({ activeKey: 'dashboard', title: 'Overview', subtitle: 'Your properties, tenants and money at a glance.' });
  const root = qs('#pageRoot');
  const can = (p) => profile.permissions.includes(p);
  const d = await api.get('/analytics/overview');
  const f = d.finance;

  qs('#pageActions').innerHTML = [
    can('tenants') ? '<a class="btn btn-primary btn-sm" href="/admin/register-tenant.html">Register tenant</a>' : '',
    can('payments') ? '<a class="btn btn-outline btn-sm" href="/admin/pending-payments.html">Pending payments</a>' : '',
    can('properties') ? '<a class="btn btn-outline btn-sm" href="/admin/properties.html">Add property</a>' : '',
  ].join(' ');

  root.innerHTML = `
    <div class="stat-grid">
      ${card('Properties', d.properties.total, { sub: `${d.properties.buildings} buildings · ${d.properties.lands} lands` })}
      ${card('Houses / Units', d.units.total, { sub: `${d.units.occupied} occupied · ${d.units.vacant} vacant` })}
      ${card('Occupancy', `${d.units.occupancyRate}%`, { sub: `${d.units.reserved} reserved · ${d.units.under_maintenance} in repair` })}
      ${card('Tenants', d.tenants.total, { sub: `${d.tenants.owing} owing · ${d.tenants.advance} paid ahead` })}
      ${card('Revenue today', formatCurrency(f.todayRevenue))}
      ${card('Revenue this month', formatCurrency(f.monthRevenue), { sub: `Expected ${formatCurrency(f.expectedMonthly)} · ${f.collectionRate}% collected` })}
      ${card('Outstanding rent', formatCurrency(f.outstandingRent), { cls: f.outstandingRent ? 'warn' : '', sub: `${d.tenants.seriousArrears} tenant(s) 3+ months behind` })}
      ${card('Net income (month)', formatCurrency(f.netIncome), { cls: f.netIncome >= 0 ? 'good' : 'warn', sub: `Expenses ${formatCurrency(f.monthExpenses)}` })}
      ${card('Unfinished buildings', d.properties.uncompleted, { sub: `${d.properties.completed} completed` })}
      ${card('Open maintenance', d.maintenance.open, { sub: `${d.maintenance.pending} not yet assigned` })}
      ${card('Pending payments', d.pendingPayments, { cls: d.pendingPayments ? 'warn' : '', sub: 'awaiting confirmation' })}
      ${card('Deposits held', formatCurrency(f.depositsHeld), { sub: `Other debts owed to you: ${formatCurrency(f.otherDebts)}` })}
    </div>
    <div class="two-col" style="margin-top:26px;">
      <div class="card card-pad"><h3 style="margin-top:0">Revenue vs expenses (6 months)</h3><div id="trendMount"><div class="spinner"></div></div></div>
      <div class="card card-pad"><h3 style="margin-top:0">Needs attention</h3><div id="insightMount"><div class="spinner"></div></div></div>
    </div>
    <div class="section-title"><h2>Property performance</h2><a href="/admin/analytics.html">Full analytics &rarr;</a></div>
    <div id="perfMount"></div>
    <div class="section-title"><h2>Rent due & overdue</h2><a href="/admin/reminders.html">All reminders &rarr;</a></div>
    <div id="dueMount"></div>`;

  api.get('/analytics/trends?months=6', { silent: true }).then((t) => { qs('#trendMount').innerHTML = bars(t); }).catch(() => { qs('#trendMount').innerHTML = '<p class="text-muted">Not available for your role.</p>'; });
  api.get('/analytics/insights', { silent: true }).then((ins) => {
    qs('#insightMount').innerHTML = ins.slice(0, 4).map((i) => `<div class="insight ${i.level}"><div><h4>${escapeHtml(i.title)}</h4><p>${escapeHtml(i.detail)}</p></div></div>`).join('') || '<p class="text-muted">Nothing to flag.</p>';
  }).catch(() => { qs('#insightMount').innerHTML = '<p class="text-muted">AI analytics is not enabled for your account.</p>'; });
  api.get('/analytics/property-performance', { silent: true }).then((rows) => {
    renderTable(qs('#perfMount'), rows, [
      { label: 'Property', render: (r) => `<a href="/admin/property-detail.html?id=${r.id}"><strong>${escapeHtml(r.name)}</strong></a>` },
      { label: 'Units', render: (r) => `${r.occupied}/${r.total_units} occupied` },
      { label: 'Occupancy', render: (r) => `${r.occupancyRate}%` },
      { label: 'Expected / month', render: (r) => formatCurrency(r.expected_monthly) },
      { label: 'Collected', render: (r) => formatCurrency(r.collected_month) },
      { label: 'Outstanding', render: (r) => formatCurrency(r.outstanding) },
      { label: 'Net (month)', render: (r) => formatCurrency(r.net_month) },
    ], { pageSize: 8, emptyMessage: 'No rental properties yet.' });
  }).catch(() => { qs('#perfMount').innerHTML = ''; });
  api.get('/analytics/reminders', { silent: true }).then((r) => {
    const rows = [...r.seriousArrears.map((x) => ({ ...x, tag: 'SERIOUS_ARREARS' })), ...r.overdue.map((x) => ({ ...x, tag: 'OVERDUE' })), ...r.dueToday.map((x) => ({ ...x, tag: 'DUE_TODAY' })), ...r.dueSoon.map((x) => ({ ...x, tag: 'DUE_SOON' }))];
    renderTable(qs('#dueMount'), rows, [
      { label: 'Tenant', render: (x) => `<a href="/admin/tenant-profile.html?id=${x.tenant_id}">${escapeHtml(x.name)}</a>` },
      { label: 'Unit', render: (x) => `${escapeHtml(x.property_name)} · ${escapeHtml(x.house_no)}/${escapeHtml(x.unit_no)}` },
      { label: 'Due', render: (x) => formatDate(x.next_payment_date) },
      { label: 'Owing', render: (x) => (x.amount_owing ? formatCurrency(x.amount_owing) : '—') },
      { label: 'Status', render: (x) => statusBadge(x.tag) },
    ], { pageSize: 8, emptyMessage: 'Nobody is due or overdue right now.' });
  }).catch(() => { qs('#dueMount').innerHTML = ''; });
}
main();
