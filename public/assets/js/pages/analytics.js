import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { renderTable } from '../crud-table.js';
import { qs, escapeHtml, formatCurrency, pctBar } from '../utils.js';

const ICON = { good: '✅', info: 'ℹ️', warning: '⚠️', critical: '🚨' };
async function main() {
  await initPortalLayout({ activeKey: 'analytics', perms: ['analytics'], title: 'AI Analytics', subtitle: 'Every insight explains the numbers it is based on, so you can check the reasoning.' });
  qs('#pageRoot').innerHTML = '<h2 style="margin-top:0">Insights & suggested actions</h2><div id="ins"><div class="spinner"></div></div><div class="section-title"><h2>Property performance</h2></div><div id="prop"></div><div class="section-title"><h2>Category performance</h2></div><div id="cat"></div><div class="section-title"><h2>Revenue trend (12 months)</h2></div><div id="trend"></div>';
  const [ins, prop, cat, trend] = await Promise.all([api.get('/analytics/insights'), api.get('/analytics/property-performance'), api.get('/analytics/category-performance'), api.get('/analytics/trends?months=12')]);
  qs('#ins').innerHTML = ins.map((i) => `<div class="insight ${i.level}"><div style="font-size:1.4rem">${ICON[i.level]}</div><div><h4>${escapeHtml(i.title)}</h4><p><strong>Why:</strong> ${escapeHtml(i.detail)}</p>${i.action ? `<div class="action">Suggested action: ${escapeHtml(i.action)}</div>` : ''}</div></div>`).join('');
  renderTable(qs('#prop'), prop, [
    { label: 'Property', render: (p) => `<a href="/admin/property-detail.html?id=${p.id}"><strong>${escapeHtml(p.name)}</strong></a>` }, { label: 'Units', render: (p) => `${p.total_units} (${p.occupied} occ · ${p.vacant} vac)` },
    { label: 'Occupancy', render: (p) => `${p.occupancyRate}%${pctBar(p.occupancyRate)}` }, { label: 'Expected', render: (p) => formatCurrency(p.expected_monthly) }, { label: 'Collected', render: (p) => formatCurrency(p.collected_month) },
    { label: 'Collection', render: (p) => `${p.collectionRate}%${pctBar(p.collectionRate)}` }, { label: 'Outstanding', render: (p) => formatCurrency(p.outstanding) }, { label: 'Net (month)', render: (p) => formatCurrency(p.net_month) },
  ], { pageSize: 10, emptyMessage: 'No rental properties yet.' });
  renderTable(qs('#cat'), cat, [
    { label: 'Category', render: (c) => `<strong>${escapeHtml(c.name)}</strong>` }, { label: 'Units', render: (c) => c.units }, { label: 'Occupied', render: (c) => c.occupied }, { label: 'Vacant', render: (c) => c.vacant },
    { label: 'Occupancy', render: (c) => `${c.occupancyRate}%` }, { label: 'Avg. days vacant', render: (c) => (c.vacant ? Math.round(c.avg_vacant_days) : '—') }, { label: 'Monthly revenue', render: (c) => formatCurrency(c.monthly_revenue) },
  ], { pageSize: 15, emptyMessage: 'No categories yet.' });
  const max = Math.max(1, ...trend.flatMap((t) => [t.revenue, t.expenses]));
  qs('#trend').innerHTML = `<div class="card card-pad"><div class="legend"><span><i style="background:var(--indigo-600)"></i>Rent collected</span><span><i style="background:var(--amber-500)"></i>Expenses</span></div><div class="bar-chart">${trend.map((t) => `<div class="col"><div class="pair"><i class="rev" style="height:${(t.revenue / max) * 100}%" title="${formatCurrency(t.revenue)}"></i><i class="exp" style="height:${(t.expenses / max) * 100}%" title="${formatCurrency(t.expenses)}"></i></div></div>`).join('')}</div><div class="bar-labels">${trend.map((t) => `<span>${t.month.slice(2)}</span>`).join('')}</div></div>`;
}
main();
